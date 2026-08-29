import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import axios from 'axios';
import { imageSize } from 'image-size';
import * as fs from 'fs';
import * as path from 'path';
import { ProductionDocument } from './entities/ProductionDocument.entity';
import { ProductionDocumentSection } from './entities/ProductionDocumentSection.entity';
import { ProductionDocumentSizeRow } from './entities/ProductionDocumentSizeRow.entity';
import { Style } from '../styles/entities/Style.entity';
import { StyleDocument } from '../styles/entities/StyleDocument.entity';
import { Document } from '../documents/entities/Document.entity';
import { BillOfMaterials } from '../boms/entities/BillOfMaterials.entity';
import { BillOfMaterialLine } from '../boms/entities/BillOfMaterialLine.entity';
import {
  ProductionDocStatus,
  DocumentPurpose,
} from '../../common/enums/database.enums';
import {
  CreateStyleProductionDocDto,
  UpdateStyleProductionDocDto,
  CopyMode,
} from './dto';

export interface StyleProductionDocDetailResponse {
  id: string;
  styleId: string | null;
  name: string;
  description: string | null;
  status: ProductionDocStatus;
  section1Description: string | null;
  section1ImageUrl: string | null;
  section2Accessories: string | null;
  section3Notes: string | null;
  section4CustomerFeedback: string | null;
  sizeData: any;
  copiedFromStyleId: string | null;
  copiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sections: {
    id: string;
    sectionCode: string;
    title: string;
    content: string | null;
    imageUrls?: string[];
    imageGroups?: {
      kind?: 'text' | 'image';
      heading: string | null;
      content?: string | null;
      headingColor: 'red' | 'black';
      imageUrls: string[];
      orderIndex?: number;
    }[];
    orderIndex: number;
    isFixed: boolean;
  }[];
  sizeRows: {
    id: string;
    sizeLabel: string;
    measurementName: string;
    measurementValue: string | null;
    tolerance: string | null;
    orderIndex: number;
  }[];
  attachments: {
    documentId: string;
    documentCode: string | null;
    title: string;
    purpose: string;
    linkedAt: Date;
  }[];
}

@Injectable()
export class StyleProductionDocsService {
  constructor(
    @InjectRepository(ProductionDocument)
    private readonly prodDocRepo: Repository<ProductionDocument>,
    @InjectRepository(ProductionDocumentSection)
    private readonly sectionRepo: Repository<ProductionDocumentSection>,
    @InjectRepository(ProductionDocumentSizeRow)
    private readonly sizeRowRepo: Repository<ProductionDocumentSizeRow>,
    @InjectRepository(Style)
    private readonly styleRepo: Repository<Style>,
    @InjectRepository(StyleDocument)
    private readonly styleDocRepo: Repository<StyleDocument>,
    @InjectRepository(Document)
    private readonly docRepo: Repository<Document>,
    @InjectRepository(BillOfMaterials)
    private readonly bomRepo: Repository<BillOfMaterials>,
    @InjectRepository(BillOfMaterialLine)
    private readonly bomLineRepo: Repository<BillOfMaterialLine>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Deduplicate & sort material names from active BOMs for a style.
   */
  private async getActiveBomMaterialCodes(
    styleCode: string,
  ): Promise<string[]> {
    const boms = await this.bomRepo.find({
      where: [
        { poCodeSnapshot: styleCode },
        { productCodeSnapshot: styleCode },
      ],
    });

    if (!boms.length) return [];

    const bomIds = boms.map((b) => b.id);
    const lines = await this.bomLineRepo.find({
      where: { billOfMaterialId: In(bomIds) },
    });

    const codes = new Set<string>();
    for (const line of lines) {
      const code = line.materialNameSnapshot;
      if (code) codes.add(code.trim());
    }

    return [...codes].sort();
  }

  private normalizeImageGroups(
    imageGroups:
      | {
          kind?: 'text' | 'image';
          heading?: string | null;
          content?: string | null;
          headingColor?: 'red' | 'black';
          imageUrls?: string[];
          orderIndex?: number;
        }[]
      | null,
    fallbackImageUrls?: string[] | null,
  ) {
    const groups =
      imageGroups && imageGroups.length > 0
        ? imageGroups
        : fallbackImageUrls?.length
            ? Array.from({ length: Math.ceil(fallbackImageUrls.length / 2) }, (_, index) => ({
              kind: 'image' as const,
              heading: null,
              content: null,
              headingColor: 'red' as const,
              imageUrls: fallbackImageUrls.slice(index * 2, index * 2 + 2),
              orderIndex: index,
            }))
          : [];

    return groups
      .map((group, index) => ({
        kind: group.kind === 'text' ? ('text' as const) : ('image' as const),
        heading: group.heading?.trim() || null,
        content: group.kind === 'text' ? group.content?.trim() || null : null,
        headingColor: group.headingColor === 'black' ? ('black' as const) : ('red' as const),
        imageUrls: (group.imageUrls ?? []).filter(Boolean).slice(0, 2),
        orderIndex: group.orderIndex ?? index,
      }))
      .filter((group) => group.heading || group.content || group.imageUrls.length > 0);
  }

  async findByStyleId(
    styleId: string,
  ): Promise<StyleProductionDocDetailResponse | null> {
    const doc = await this.prodDocRepo.findOne({
      where: { styleId },
      order: { createdAt: 'DESC' },
    });

    if (!doc) return null;

    return this.buildDetailResponse(doc);
  }

  async findOne(docId: string): Promise<StyleProductionDocDetailResponse> {
    const doc = await this.prodDocRepo.findOne({ where: { id: docId } });
    if (!doc) {
      throw new NotFoundException(
        `Không tìm thấy tài liệu sản xuất với ID: ${docId}`,
      );
    }
    return this.buildDetailResponse(doc);
  }

  async createWithAutoFill(
    styleId: string,
    dto: CreateStyleProductionDocDto,
    userId?: string,
  ): Promise<StyleProductionDocDetailResponse> {
    const style = await this.styleRepo.findOne({ where: { id: styleId } });
    if (!style) {
      throw new NotFoundException(`Không tìm thấy mẫu Fit với ID: ${styleId}`);
    }

    const existingDoc = await this.prodDocRepo.findOne({ where: { styleId } });
    if (existingDoc) {
      throw new BadRequestException(
        `Mẫu Fit "${style.styleCode}" đã có tài liệu sản xuất`,
      );
    }

    const section1ImageUrl =
      dto.section1ImageUrl?.trim() || style.baseImageVersionId || null;
    const section1Description = dto.section1Description?.trim() || style.description || null;

    const materialCodes = await this.getActiveBomMaterialCodes(style.styleCode);
    const section2Accessories =
      dto.section2Accessories?.trim() || (materialCodes.length > 0 ? materialCodes.join('\n') : null);
    const section3Notes = dto.section3Notes?.trim() || null;
    const section4CustomerFeedback = dto.section4CustomerFeedback?.trim() || null;

    const doc = this.prodDocRepo.create({
      styleId,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? null,
      status: dto.status ?? ProductionDocStatus.DRAFT,
      section1ImageUrl,
      section1Description,
      section2Accessories,
      section3Notes,
      section4CustomerFeedback,
      sizeData: dto.sizeData ?? null,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    });

    const savedDoc: ProductionDocument = await this.prodDocRepo.save(doc);

    // Auto-fill Default 4 Sections
    const defaultSections: ProductionDocumentSection[] = [
      this.sectionRepo.create({
        productionDocumentId: savedDoc.id,
        sectionCode: 'SEC1',
        title: 'Mô tả hình dáng',
        content: section1Description,
        orderIndex: 1,
        isFixed: true,
      }),
      this.sectionRepo.create({
        productionDocumentId: savedDoc.id,
        sectionCode: 'SEC2',
        title: 'Phụ liệu',
        content: section2Accessories,
        orderIndex: 2,
        isFixed: true,
      }),
      this.sectionRepo.create({
        productionDocumentId: savedDoc.id,
        sectionCode: 'SEC3',
        title: 'Lưu ý trải cắt',
        content: section3Notes,
        orderIndex: 3,
        isFixed: true,
      }),
      this.sectionRepo.create({
        productionDocumentId: savedDoc.id,
        sectionCode: 'SEC4',
        title: 'Comment khách hàng',
        content: section4CustomerFeedback,
        orderIndex: 4,
        isFixed: true,
      }),
    ];

    if (dto.sections && dto.sections.length > 0) {
      let dynamicOrder = 5;
      for (const sDto of dto.sections) {
        if (!sDto.isFixed) {
          defaultSections.push(
            this.sectionRepo.create({
              productionDocumentId: savedDoc.id,
              sectionCode: sDto.sectionCode || `SEC_DYN_${dynamicOrder}`,
              title: sDto.title.trim(),
              content: sDto.content?.trim() ?? null,
              imageGroups: sDto.imageGroups ?? [],
              orderIndex: sDto.orderIndex ?? dynamicOrder,
              isFixed: false,
            }),
          );
          dynamicOrder++;
        }
      }
    }

    await this.sectionRepo.save(defaultSections);

    if (dto.sizeRows && dto.sizeRows.length > 0) {
      const sizeEntities: ProductionDocumentSizeRow[] = dto.sizeRows.map(
        (sr, index) =>
          this.sizeRowRepo.create({
            productionDocumentId: savedDoc.id,
            sizeLabel: sr.sizeLabel.trim(),
            measurementName: sr.measurementName.trim(),
            measurementValue: sr.measurementValue?.trim() ?? null,
            tolerance: sr.tolerance?.trim() ?? null,
            orderIndex: sr.orderIndex ?? index + 1,
          }),
      );
      await this.sizeRowRepo.save(sizeEntities);
    }

    if (dto.attachmentIds && dto.attachmentIds.length > 0) {
      for (const docId of dto.attachmentIds) {
        await this.linkAttachment(
          styleId,
          docId,
          DocumentPurpose.PRODUCTION_DOC,
          userId,
        );
      }
    }

    return this.buildDetailResponse(savedDoc);
  }

  /**
   * Re-sync section1 and/or section2 from current Style + BOM data.
   */
  async resync(
    docId: string,
    options?: {
      sections?: ('section1' | 'section2')[];
      confirmOverwrite?: boolean;
    },
  ): Promise<StyleProductionDocDetailResponse> {
    const doc = await this.prodDocRepo.findOne({ where: { id: docId } });
    if (!doc || !doc.styleId) {
      throw new NotFoundException(
        `Không tìm thấy tài liệu sản xuất với ID: ${docId}`,
      );
    }

    const style = await this.styleRepo.findOne({ where: { id: doc.styleId } });
    if (!style) {
      throw new NotFoundException(`Không tìm thấy Mẫu Fit #${doc.styleId}`);
    }

    const sectionsToSync = options?.sections ?? ['section1', 'section2'];

    if (sectionsToSync.includes('section1')) {
      doc.section1ImageUrl = style.baseImageVersionId ?? null;
      doc.section1Description = style.description
        ? style.description.slice(0, 10000)
        : null;
    }

    if (sectionsToSync.includes('section2')) {
      const materialCodes = await this.getActiveBomMaterialCodes(
        style.styleCode,
      );
      doc.section2Accessories =
        materialCodes.length > 0 ? materialCodes.join('\n') : null;
    }

    await this.prodDocRepo.save(doc);

    // Sync section entities
    const existingSections = await this.sectionRepo.find({
      where: { productionDocumentId: docId },
    });

    if (sectionsToSync.includes('section1')) {
      const sec1 = existingSections.find((s) => s.sectionCode === 'SEC1');
      if (sec1 && doc.section1Description) {
        sec1.content = doc.section1Description;
        await this.sectionRepo.save(sec1);
      }
    }

    if (sectionsToSync.includes('section2')) {
      const sec2 = existingSections.find((s) => s.sectionCode === 'SEC2');
      if (sec2 && doc.section2Accessories) {
        sec2.content = doc.section2Accessories;
        await this.sectionRepo.save(sec2);
      }
    }

    return this.buildDetailResponse(doc);
  }

  /**
   * Copy production doc to another style's technical document.
   */
  async copyToStyle(
    sourceDocId: string,
    targetStyleId: string,
    mode: CopyMode,
    excludeSections?: string[],
    userRole?: string,
    confirmOverwrite?: boolean,
  ): Promise<StyleProductionDocDetailResponse> {
    const sourceDoc = await this.prodDocRepo.findOne({
      where: { id: sourceDocId },
    });
    if (!sourceDoc) {
      throw new NotFoundException(
        `Tài liệu sản xuất nguồn #${sourceDocId} không tồn tại`,
      );
    }

    const targetStyle = await this.styleRepo.findOne({
      where: { id: targetStyleId },
    });
    if (!targetStyle) {
      throw new NotFoundException(
        `Mẫu Fit đích #${targetStyleId} không tồn tại`,
      );
    }

    if (sourceDoc.styleId === targetStyleId) {
      throw new BadRequestException('Mẫu Fit nguồn và đích phải khác nhau');
    }

    const allSectionKeys = [
      'section1',
      'section2',
      'section3',
      'section4',
      'sizeData',
      'sections',
    ];
    if (mode === CopyMode.EXCLUDE && excludeSections) {
      const excluded = excludeSections.filter((s) =>
        allSectionKeys.includes(s),
      );
      if (excluded.length >= allSectionKeys.length) {
        throw new BadRequestException(
          'Phải giữ lại ít nhất 1 section khi thực hiện copy',
        );
      }
    }

    const existingTargetDocs = await this.prodDocRepo.find({
      where: { styleId: targetStyleId },
      order: { createdAt: 'DESC' },
    });
    const existingTargetDoc = existingTargetDocs[0] ?? null;

    if (existingTargetDoc) {
      const hasContent =
        existingTargetDoc.section1Description != null ||
        existingTargetDoc.section1ImageUrl != null ||
        existingTargetDoc.section2Accessories != null ||
        existingTargetDoc.section3Notes != null ||
        existingTargetDoc.section4CustomerFeedback != null ||
        existingTargetDoc.sizeData != null;

      if (hasContent && !confirmOverwrite) {
        throw new ConflictException(
          'Mẫu Fit đích đã có nội dung. Vui lòng xác nhận ghi đè (confirmOverwrite=true)',
        );
      }

      if (
        existingTargetDoc.status === ProductionDocStatus.COMPLETED &&
        userRole !== 'TPKH'
      ) {
        throw new ForbiddenException(
          'Yêu cầu quyền TPKH để ghi đè tài liệu đã hoàn tất',
        );
      }
    }

    const excludedSet = new Set(
      mode === CopyMode.EXCLUDE ? (excludeSections ?? []) : [],
    );

    const targetData: Partial<ProductionDocument> = {};
    if (!excludedSet.has('section1')) {
      targetData.section1Description = sourceDoc.section1Description;
      targetData.section1ImageUrl = sourceDoc.section1ImageUrl;
    }
    if (!excludedSet.has('section2')) {
      targetData.section2Accessories = sourceDoc.section2Accessories;
    }
    if (!excludedSet.has('section3')) {
      targetData.section3Notes = sourceDoc.section3Notes;
    }
    if (!excludedSet.has('section4')) {
      targetData.section4CustomerFeedback = sourceDoc.section4CustomerFeedback;
    }
    if (!excludedSet.has('sizeData')) {
      targetData.sizeData = sourceDoc.sizeData;
    }

    targetData.copiedFromStyleId = sourceDoc.styleId;
    targetData.copiedAt = new Date();

    let targetDoc: ProductionDocument;
    if (existingTargetDoc) {
      Object.assign(existingTargetDoc, targetData);
      targetDoc = await this.prodDocRepo.save(existingTargetDoc);
    } else {
      const newDoc = this.prodDocRepo.create({
        ...targetData,
        styleId: targetStyleId,
        name: sourceDoc.name,
        description: sourceDoc.description,
        status: ProductionDocStatus.DRAFT,
      });
      targetDoc = await this.prodDocRepo.save(newDoc);
    }

    return this.buildDetailResponse(targetDoc);
  }

  async update(
    docId: string,
    dto: UpdateStyleProductionDocDto,
    userId?: string,
  ): Promise<StyleProductionDocDetailResponse> {
    const doc = await this.dataSource.transaction(async (manager) => {
      const prodDocRepo = manager.getRepository(ProductionDocument);
      const sectionRepo = manager.getRepository(ProductionDocumentSection);
      const sizeRowRepo = manager.getRepository(ProductionDocumentSizeRow);

      const doc = await prodDocRepo.findOne({ where: { id: docId } });
      if (!doc) {
        throw new NotFoundException(
          `Không tìm thấy tài liệu sản xuất với ID: ${docId}`,
        );
      }

      if (dto.name !== undefined) doc.name = dto.name.trim();
      if (dto.description !== undefined)
        doc.description = dto.description ? dto.description.trim() : null;
      if (dto.status !== undefined) doc.status = dto.status;
      if (dto.section1Description !== undefined)
        doc.section1Description = dto.section1Description
          ? dto.section1Description.trim()
          : null;
      if (dto.section1ImageUrl !== undefined)
        doc.section1ImageUrl = dto.section1ImageUrl
          ? dto.section1ImageUrl.trim()
          : null;
      if (dto.section2Accessories !== undefined)
        doc.section2Accessories = dto.section2Accessories
          ? dto.section2Accessories.trim()
          : null;
      if (dto.section3Notes !== undefined)
        doc.section3Notes = dto.section3Notes ? dto.section3Notes.trim() : null;
      if (dto.section4CustomerFeedback !== undefined)
        doc.section4CustomerFeedback = dto.section4CustomerFeedback
          ? dto.section4CustomerFeedback.trim()
          : null;
      if (dto.sizeData !== undefined) doc.sizeData = dto.sizeData;

      doc.updatedBy = userId ?? null;
      doc.rowVersion = Number(doc.rowVersion) + 1;
      await prodDocRepo.save(doc);

      const existingSections = await sectionRepo.find({
        where: { productionDocumentId: docId },
      });

      const sec1 = existingSections.find((s) => s.sectionCode === 'SEC1');
      if (sec1 && dto.section1Description !== undefined) {
        sec1.content = doc.section1Description;
        await sectionRepo.save(sec1);
      }

      const sec2 = existingSections.find((s) => s.sectionCode === 'SEC2');
      if (sec2 && dto.section2Accessories !== undefined) {
        sec2.content = doc.section2Accessories;
        await sectionRepo.save(sec2);
      }

      const sec3 = existingSections.find((s) => s.sectionCode === 'SEC3');
      if (sec3 && dto.section3Notes !== undefined) {
        sec3.content = doc.section3Notes;
        await sectionRepo.save(sec3);
      }

      const sec4 = existingSections.find((s) => s.sectionCode === 'SEC4');
      if (sec4 && dto.section4CustomerFeedback !== undefined) {
        sec4.content = doc.section4CustomerFeedback;
        await sectionRepo.save(sec4);
      }

      if (dto.sections !== undefined) {
        const nonFixed = existingSections.filter((s) => !s.isFixed);
        if (nonFixed.length > 0) {
          await sectionRepo.remove(nonFixed);
        }

        let dynamicOrder = 5;
        const newSections: ProductionDocumentSection[] = dto.sections
          .filter((s) => !s.isFixed)
          .map((s) =>
            sectionRepo.create({
              productionDocumentId: docId,
              sectionCode: s.sectionCode || `SEC_DYN_${dynamicOrder++}`,
              title: s.title.trim(),
              content: s.content?.trim() ?? null,
              imageGroups: s.imageGroups ?? [],
              orderIndex: s.orderIndex ?? dynamicOrder,
              isFixed: false,
            }),
          );
        if (newSections.length > 0) {
          await sectionRepo.save(newSections);
        }
      }

      if (dto.sizeRows !== undefined) {
        const existingSizeRows = await sizeRowRepo.find({
          where: { productionDocumentId: docId },
        });
        if (existingSizeRows.length > 0) {
          await sizeRowRepo.remove(existingSizeRows);
        }

        const newSizeRows: ProductionDocumentSizeRow[] = dto.sizeRows.map(
          (sr, index) =>
            sizeRowRepo.create({
              productionDocumentId: docId,
              sizeLabel: sr.sizeLabel.trim(),
              measurementName: sr.measurementName.trim(),
              measurementValue: sr.measurementValue?.trim() ?? null,
              tolerance: sr.tolerance?.trim() ?? null,
              orderIndex: sr.orderIndex ?? index + 1,
            }),
        );
        if (newSizeRows.length > 0) {
          await sizeRowRepo.save(newSizeRows);
        }
      }

      return doc;
    });

    return this.buildDetailResponse(doc);
  }

  async updateStatus(
    docId: string,
    status: ProductionDocStatus,
    userId?: string,
  ): Promise<StyleProductionDocDetailResponse> {
    const doc = await this.prodDocRepo.findOne({ where: { id: docId } });
    if (!doc) {
      throw new NotFoundException(
        `Không tìm thấy tài liệu sản xuất với ID: ${docId}`,
      );
    }
    doc.status = status;
    doc.updatedBy = userId ?? null;
    await this.prodDocRepo.save(doc);
    return this.buildDetailResponse(doc);
  }

  async linkAttachment(
    styleId: string,
    documentId: string,
    purpose: DocumentPurpose = DocumentPurpose.PRODUCTION_DOC,
    userId?: string,
  ): Promise<void> {
    const existingLink = await this.styleDocRepo.findOne({
      where: { styleId, documentId },
    });

    if (!existingLink) {
      const styleDoc = this.styleDocRepo.create({
        styleId,
        documentId,
        purpose,
        linkedBy: userId ?? null,
        linkedAt: new Date(),
      });
      await this.styleDocRepo.save(styleDoc);
    }
  }

  async unlinkAttachment(styleId: string, documentId: string): Promise<void> {
    const existingLink = await this.styleDocRepo.findOne({
      where: { styleId, documentId },
    });

    if (existingLink) {
      await this.styleDocRepo.remove(existingLink);
    }
  }

  async remove(docId: string): Promise<void> {
    const doc = await this.prodDocRepo.findOne({ where: { id: docId } });
    if (!doc) {
      throw new NotFoundException(
        `Không tìm thấy tài liệu sản xuất với ID: ${docId}`,
      );
    }
    await this.prodDocRepo.remove(doc);
  }

  /**
   * Export official production document to Excel workbook matching Tấn Minh company format.
   */
  async exportExcel(styleId: string): Promise<Buffer> {
    const style = await this.styleRepo.findOne({ where: { id: styleId } });
    if (!style) throw new NotFoundException('Style not found');

    const docs = await this.prodDocRepo.find({
      where: { styleId },
      order: { createdAt: 'DESC' },
    });
    let doc = docs[0];
    if (!doc) {
      const created = await this.createWithAutoFill(styleId, {
        name: `Tài liệu sản xuất - ${style.styleCode}`,
      });
      const freshDoc = await this.prodDocRepo.findOne({
        where: { id: created.id },
      });
      doc = freshDoc || (created as any);
    }

    const WorkbookClass =
      (ExcelJS as any).Workbook ||
      (ExcelJS as any).default?.Workbook ||
      (ExcelJS as any).default;
    const wb = new WorkbookClass();
    const ws = wb.addWorksheet('Tài liệu SX');

    ws.columns = [
      { width: 5 }, // A
      { width: 36 }, // B
      { width: 12 }, // C
      { width: 12 }, // D
      { width: 12 }, // E
      { width: 12 }, // F
      { width: 12 }, // G
      { width: 25 }, // H - padding for long Vietnamese text
    ];

    const EXPORT_FONT_NAME = 'Times New Roman';
    const DARK_BG: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' },
    };
    const META_FONT: Partial<ExcelJS.Font> = {
      name: 'Times New Roman',
      bold: true,
      size: 14,
    };
    const SECTION_TITLE_FONT: Partial<ExcelJS.Font> = {
      name: 'Times New Roman',
      bold: true,
      underline: true,
      color: { argb: 'FFFF0000' },
      size: 14,
    };
    const BODY_FONT: Partial<ExcelJS.Font> = {
      name: 'Times New Roman',
      size: 12,
      bold: false,
    };
    const COMMENT_FONT: Partial<ExcelJS.Font> = {
      name: 'Times New Roman',
      size: 10,
      bold: false,
    };
    const TABLE_FONT: Partial<ExcelJS.Font> = {
      name: 'Times New Roman',
      size: 11,
      bold: false,
    };
    const EXPORT_DATE_FONT: Partial<ExcelJS.Font> = {
      name: 'Times New Roman',
      bold: true,
      italic: true,
      underline: true,
      color: { argb: 'FFFF0000' },
      size: 14,
    };

    const applyStyle = (cell: ExcelJS.Cell, style: Partial<ExcelJS.Style>) => {
      if (style.fill) cell.fill = style.fill;
      if (style.font) cell.font = { ...style.font, name: EXPORT_FONT_NAME };
      if (style.alignment) cell.alignment = style.alignment;
      if (style.border) cell.border = style.border;
    };

    const mergeCellsWithoutStyle = (
      top: number,
      left: number,
      bottom: number,
      right: number,
    ) => {
      ws.mergeCells(top, left, bottom, right);
    };

    const setRangeBorder = (
      top: number,
      left: number,
      bottom: number,
      right: number,
      sides: {
        top?: boolean;
        right?: boolean;
        bottom?: boolean;
        left?: boolean;
      },
      borderStyle: ExcelJS.BorderStyle = 'medium',
    ) => {
      const border = { style: borderStyle };
      if (sides.top)
        for (let c = left; c <= right; c++) {
          const cell = ws.getCell(top, c);
          cell.border = { ...cell.border, top: border };
        }
      if (sides.right)
        for (let r = top; r <= bottom; r++) {
          const cell = ws.getCell(r, right);
          cell.border = { ...cell.border, right: border };
        }
      if (sides.bottom)
        for (let c = left; c <= right; c++) {
          const cell = ws.getCell(bottom, c);
          cell.border = { ...cell.border, bottom: border };
        }
      if (sides.left)
        for (let r = top; r <= bottom; r++) {
          const cell = ws.getCell(r, left);
          cell.border = { ...cell.border, left: border };
        }
    };

    const clearRangeBottomBorder = (rowIndex: number, left: number, right: number) => {
      for (let c = left; c <= right; c++) {
        const cell = ws.getCell(rowIndex, c);
        const border = { ...cell.border };
        delete border.bottom;
        cell.border = border;
      }
    };

    const exportDate = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    }).format(new Date());

    let row = 1;

    // Header 1
    ws.mergeCells(1, 1, 1, 8);
    const r1 = ws.getRow(1).getCell(1);
    applyStyle(r1, {
      fill: DARK_BG,
      alignment: { horizontal: 'center', vertical: 'middle' },
    });
    r1.value = {
      richText: [
        {
          font: { name: EXPORT_FONT_NAME, bold: true, size: 13, color: { argb: 'FFFFFFFF' } },
          text: 'CÔNG TY TNHH DỆT MAY THƯƠNG MẠI ',
        },
        {
          font: { name: EXPORT_FONT_NAME, bold: true, size: 15, color: { argb: 'FFFF0000' } },
          text: 'TẤN   MINH',
        },
      ],
    };
    ws.getRow(1).height = 28;

    // Header 2
    ws.mergeCells(2, 1, 2, 8);
    const r2 = ws.getRow(2).getCell(1);
    applyStyle(r2, {
      fill: DARK_BG,
      font: { name: EXPORT_FONT_NAME, bold: true, size: 10, color: { argb: 'FFFFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    });
    r2.value = 'TAN MINH TEXTILE SEWING TRADING CO.,LTD';
    ws.getRow(2).height = 18;

    // Style info row
    [
      `STYLE: ${style.styleCode ?? '—'}`,
      `TÊN: ${style.styleName ?? '—'}`,
      `LOẠI: ${style.category ?? '—'}`,
      `TRẠNG THÁI: ${doc.status ?? '—'}`,
    ].forEach((val, i) => {
      const c = i * 2 + 1;
      mergeCellsWithoutStyle(3, c, 3, c + 1);
      const cell = ws.getRow(3).getCell(c);
      cell.value = val;
      applyStyle(cell, {
        font: META_FONT,
        alignment: { horizontal: 'center', vertical: 'top', wrapText: true },
      });
      setRangeBorder(3, c, 3, c + 1, {
        top: true,
        right: true,
        bottom: true,
        left: true,
      });
    });
    ws.getRow(3).height = 24;
    row = 4;

    const secTitle = (text: string, colEnd = 8) => {
      mergeCellsWithoutStyle(row, 1, row, colEnd);
      const cell = ws.getRow(row).getCell(1);
      cell.value = text;
      applyStyle(cell, {
        font: SECTION_TITLE_FONT,
        alignment: { vertical: 'middle' },
      });
      setRangeBorder(row, 1, row, colEnd, { top: true, right: true });
      ws.getRow(row).height = 20;
      row++;
    };

    const textBlock = (
      text: string | null | undefined,
      minRows = 2,
      font: Partial<ExcelJS.Font> = BODY_FONT,
    ) => {
      const content = (text ?? '').trim();
      const lines = content ? content.split(/\r?\n/) : [''];
      const numRows = Math.max(lines.length, minRows);
      for (let i = 0; i < numRows; i++) {
        const cell = ws.getRow(row + i).getCell(1);
        cell.value = lines[i] ?? '';
        applyStyle(cell, {
          font,
          alignment: { vertical: 'middle', wrapText: false },
        });
        setRangeBorder(row + i, 1, row + i, 8, {
          right: true,
          left: true,
          bottom: i === numRows - 1,
        });
        ws.getRow(row + i).height = 20;
      }
      row += numRows;
    };

    // Section 1 + 2
    secTitle('1. MÔ TẢ HÌNH DÁNG:', 2);
    row--;
    mergeCellsWithoutStyle(row, 3, row, 8);
    const s2TitleCell = ws.getRow(row).getCell(3);
    s2TitleCell.value = '2. PHỤ LIỆU:';
    applyStyle(s2TitleCell, {
      font: SECTION_TITLE_FONT,
      alignment: { vertical: 'middle' },
    });
    setRangeBorder(row, 3, row, 8, { top: true, right: true });
    row++;

    const phuLieuText = (doc.section2Accessories ?? '').trim();
    const phuLieuLines = phuLieuText ? phuLieuText.split(/\r?\n/) : [];
    const areaRows = Math.max(12, phuLieuLines.length);
    const areaStart = row;

    mergeCellsWithoutStyle(areaStart, 1, areaStart + areaRows - 1, 2);
    applyStyle(ws.getRow(areaStart).getCell(1), {
      alignment: { horizontal: 'center', vertical: 'middle' },
    });
    setRangeBorder(
      areaStart,
      1,
      areaStart + areaRows - 1,
      2,
      { top: true, right: true, bottom: true, left: true },
      'thin',
    );

    for (let i = 0; i < areaRows; i++) {
      const cell = ws.getRow(areaStart + i).getCell(3);
      cell.value = phuLieuLines[i] ?? '';
      applyStyle(cell, {
        font: BODY_FONT,
        alignment: { vertical: 'middle', wrapText: false },
      });
      setRangeBorder(areaStart + i, 3, areaStart + i, 8, {
        right: true,
        left: true,
        bottom: i === areaRows - 1,
      });
      ws.getRow(areaStart + i).height = 20;
    }
    const areaEnd = areaStart + areaRows - 1;

    const sketchImgUrl = doc.section1ImageUrl || style.baseImageVersionId;
    if (sketchImgUrl) {
      const imgRes = await this.getImageBuffer(sketchImgUrl);
      if (imgRes) {
        try {
          const imgId = wb.addImage({
            buffer: imgRes.buffer as any,
            extension: imgRes.extension,
          });
          ws.addImage(imgId, {
            tl: { col: 0, row: areaStart - 1 } as any,
            br: { col: 2, row: areaEnd } as any,
          });
        } catch {
          /* skip image embed error */
        }
      }
    }
    row = areaEnd + 1;

    // Section 3
    secTitle('3. LƯU Ý TRẢI CẮT:');
    textBlock(doc.section3Notes);

    // Section 4
    secTitle('4. COMMENT GÓP Ý KHÁCH HÀNG:');
    textBlock(doc.section4CustomerFeedback, 2, COMMENT_FONT);

    // Section 5: Full size images
    secTitle('5. THÔNG SỐ FULL SIZE:');

    const sizeImages: string[] = [];

    // Collect images from doc.sizeData JSON
    if (Array.isArray(doc.sizeData)) {
      for (const item of doc.sizeData) {
        if (
          item &&
          typeof item === 'object' &&
          item.imageUrl &&
          typeof item.imageUrl === 'string'
        ) {
          if (!sizeImages.includes(item.imageUrl)) {
            sizeImages.push(item.imageUrl);
          }
        } else if (typeof item === 'string' && item.trim()) {
          if (!sizeImages.includes(item)) {
            sizeImages.push(item);
          }
        }
      }
    }

    // Collect images from sizeRowRepo
    const sizeRows = await this.sizeRowRepo.find({
      where: { productionDocumentId: doc.id },
      order: { orderIndex: 'ASC' },
    });

    for (const sr of sizeRows) {
      const imgUrl = (sr as any).imageUrl;
      if (
        imgUrl &&
        typeof imgUrl === 'string' &&
        !sizeImages.includes(imgUrl)
      ) {
        sizeImages.push(imgUrl);
      }
    }

    const FULL_SIZE_DEFAULT_ROW_PX = 20;
    const FULL_SIZE_FRAME_W_PX = [5, 36, 12, 12, 12, 12, 12, 10].reduce(
      (sum, width) => sum + width * 7,
      0,
    );
    const FULL_SIZE_IMAGE_TOP_PADDING_PX = 8;
    let embeddedCount = 0;
    for (const imgUrl of sizeImages) {
      const imgRes = await this.getImageBuffer(imgUrl);
      if (!imgRes) continue;
      try {
        const dims = imageSize(imgRes.buffer);
        const origW = dims.width ?? FULL_SIZE_FRAME_W_PX;
        const origH = dims.height ?? 280;
        const scale = Math.min(1, (FULL_SIZE_FRAME_W_PX * 0.8) / origW);
        const scaledW = Math.round(origW * scale);
        const scaledH = Math.round(origH * scale);
        const rowsNeeded = Math.max(
          1,
          Math.ceil(
            (scaledH + FULL_SIZE_IMAGE_TOP_PADDING_PX) /
              FULL_SIZE_DEFAULT_ROW_PX,
          ),
        );
        const rowHeight =
          (scaledH + FULL_SIZE_IMAGE_TOP_PADDING_PX) / rowsNeeded;
        const startR = row;
        const endR = startR + rowsNeeded - 1;

        for (let r = startR; r <= endR; r++) ws.getRow(r).height = rowHeight;
        mergeCellsWithoutStyle(startR, 1, endR, 8);
        setRangeBorder(
          startR,
          1,
          endR,
          8,
          { top: true, right: true, bottom: true, left: true },
          'medium',
        );

        const imgId = wb.addImage({
          buffer: imgRes.buffer as any,
          extension: imgRes.extension,
        });
        ws.addImage(imgId, {
          tl: {
            col: Math.max(0, (FULL_SIZE_FRAME_W_PX - scaledW) / 2) / 67.2,
            row: startR - 1 + FULL_SIZE_IMAGE_TOP_PADDING_PX / FULL_SIZE_DEFAULT_ROW_PX,
          } as any,
          ext: { width: scaledW, height: scaledH },
        } as any);
        row = endR + 1;
        embeddedCount++;
      } catch {
        /* skip image embed error */
      }
    }

    if (embeddedCount === 0) {
      textBlock('', 2);
    }

    // Dynamic sections — reuse the PO export layout: paired image groups share
    // the row, headings are aligned with their image columns, and borders are
    // applied only to the outer frame to avoid doubled black lines.
    const sections = await this.sectionRepo.find({
      where: { productionDocumentId: doc.id },
      order: { orderIndex: 'ASC' },
    });

    const DEFAULT_ROW_PX = 20;
    const IMAGE_TOP_PADDING_PX = 8;
    const DYNAMIC_IMAGE_TARGET_HEIGHT_PX = 150;
    const IMAGE_LAYOUT_COLUMN_WIDTHS = [5, 36, 12, 12, 12, 12, 12, 10];
    const FRAME_W_PX = IMAGE_LAYOUT_COLUMN_WIDTHS.reduce((sum, width) => sum + width * 7, 0);
    const getSlotWidthPx = (start: number, end: number) =>
      IMAGE_LAYOUT_COLUMN_WIDTHS.slice(start, end).reduce((sum, width) => sum + width * 7, 0);
    const allocateGroupBounds = (groups: { imageUrls: string[] }[]) => {
      if (groups.length === 1) return [{ start: 0, end: 8 }];
      const leftCount = groups[0].imageUrls.length;
      const rightCount = groups[1].imageUrls.length;
      const splitCol = leftCount === rightCount ? 4 : leftCount > rightCount ? 6 : 2;
      return [{ start: 0, end: splitCol }, { start: splitCol, end: 8 }];
    };
    const splitGroupIntoImageSlots = (start: number, end: number, count: number) => {
      if (count <= 1) return [{ start, end }];
      const middle = start + Math.floor((end - start) / 2);
      return [{ start, end: middle }, { start: middle, end }];
    };
    const renderDynamicImageGroup = async (
      imageGroups: ReturnType<StyleProductionDocsService['normalizeImageGroups']>,
    ) => {
      for (let groupStart = 0; groupStart < imageGroups.length; ) {
        const currentGroup = imageGroups[groupStart];
        if (currentGroup.kind === 'text') {
          mergeCellsWithoutStyle(row, 1, row, 8);
          const textHeadingCell = ws.getRow(row).getCell(1);
          textHeadingCell.value = currentGroup.heading?.toUpperCase() ?? '';
          applyStyle(textHeadingCell, {
            font: { ...TABLE_FONT, bold: true, color: { argb: 'FF000000' } },
            alignment: { horizontal: 'left', vertical: 'middle' },
          });
          setRangeBorder(row, 1, row, 8, { left: true, right: true }, 'medium');
          ws.getRow(row).height = 20;
          row++;
          if (currentGroup.content) textBlock(currentGroup.content, 1, TABLE_FONT);
          groupStart++;
          continue;
        }

        const nextGroup = imageGroups[groupStart + 1];
        const pairSize = nextGroup && nextGroup.kind !== 'text' ? 2 : 1;
        const groupPair = imageGroups.slice(groupStart, groupStart + pairSize);
        groupStart += pairSize;
        const groupBounds = allocateGroupBounds(groupPair);
        const hasHeading = groupPair.some((group) => group.heading);

        if (hasHeading) {
          groupPair.forEach((group, groupIndex) => {
            const slot = groupBounds[groupIndex];
            mergeCellsWithoutStyle(row, slot.start + 1, row, slot.end);
            const headingCell = ws.getRow(row).getCell(slot.start + 1);
            headingCell.value = group.heading?.toUpperCase() ?? '';
            applyStyle(headingCell, {
              font: {
                ...TABLE_FONT,
                bold: true,
                underline: true,
                color: { argb: group.headingColor === 'red' ? 'FFFF0000' : 'FF000000' },
              },
              alignment: { horizontal: 'center', vertical: 'middle' },
            });
          });
          setRangeBorder(row, 1, row, 8, { left: true, right: true }, 'medium');
          ws.getRow(row).height = 20;
          row++;
        }

        const scaledImages: {
          buffer: Buffer;
          extension: 'png' | 'jpeg';
          tlCol: number;
          scaledW: number;
          scaledH: number;
        }[] = [];

        for (let groupIndex = 0; groupIndex < groupPair.length; groupIndex++) {
          const urls = groupPair[groupIndex].imageUrls.filter(Boolean).slice(0, 2);
          const slots = splitGroupIntoImageSlots(
            groupBounds[groupIndex].start,
            groupBounds[groupIndex].end,
            urls.length,
          );
          for (let imageIndex = 0; imageIndex < urls.length; imageIndex++) {
            const image = await this.getImageBuffer(urls[imageIndex]);
            if (!image) continue;
            const dims = imageSize(image.buffer);
            const origW = dims.width ?? FRAME_W_PX;
            const origH = dims.height ?? 280;
            const slot = slots[imageIndex];
            const maxWidth = Math.max(1, getSlotWidthPx(slot.start, slot.end) - 8);
            const scale = Math.min(1, maxWidth / origW, DYNAMIC_IMAGE_TARGET_HEIGHT_PX / origH);
            scaledImages.push({
              buffer: image.buffer,
              extension: image.extension,
              tlCol: slot.start + Math.max(0, (maxWidth - Math.round(origW * scale)) / 2) / 67.2,
              scaledW: Math.round(origW * scale),
              scaledH: Math.round(origH * scale),
            });
          }
        }

        if (scaledImages.length === 0) continue;
        const rowMaxHeight = Math.max(...scaledImages.map((image) => image.scaledH)) + IMAGE_TOP_PADDING_PX;
        const rowsNeeded = Math.max(1, Math.ceil(rowMaxHeight / DEFAULT_ROW_PX));
        const rowHeight = rowMaxHeight / rowsNeeded;
        for (let k = 0; k < rowsNeeded; k++) ws.getRow(row + k).height = rowHeight;
        setRangeBorder(row, 1, row + rowsNeeded - 1, 8, {
          right: true,
          bottom: true,
          left: true,
        }, 'medium');
        for (const image of scaledImages) {
          const imageId = wb.addImage({ buffer: image.buffer as any, extension: image.extension });
          ws.addImage(imageId, {
            tl: { col: image.tlCol, row: row - 1 + IMAGE_TOP_PADDING_PX / DEFAULT_ROW_PX } as any,
            ext: { width: image.scaledW, height: image.scaledH },
          } as any);
        }
        row += rowsNeeded;
      }
    };

    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      if (sec.isFixed) continue;
      secTitle(`${i + 6}. ${(sec.title ?? '').toUpperCase()}:`);
      textBlock(sec.content);
      const imageGroups = this.normalizeImageGroups(sec.imageGroups, undefined);
      if (imageGroups.length > 0) clearRangeBottomBorder(row - 1, 1, 8);
      await renderDynamicImageGroup(imageGroups);
    }

    // Footer
    mergeCellsWithoutStyle(row, 1, row, 8);
    const exportedAtCell = ws.getRow(row).getCell(1);
    exportedAtCell.value = `TM ${exportDate}`;
    applyStyle(exportedAtCell, {
      font: EXPORT_DATE_FONT,
      alignment: { horizontal: 'center', vertical: 'middle' },
    });
    setRangeBorder(row, 1, row, 8, {
      top: true,
      right: true,
      bottom: true,
      left: true,
    });

    // Excel rich-text runs keep their own font, so styling only the cell is
    // not enough. Normalize both the cell font and every rich-text run before
    // serializing the workbook. This also covers text that originated from a
    // pasted source with a different font.
    ws.eachRow({ includeEmpty: true }, (worksheetRow: ExcelJS.Row) => {
      worksheetRow.eachCell({ includeEmpty: true }, (cell: ExcelJS.Cell) => {
        cell.font = { ...(cell.font ?? {}), name: EXPORT_FONT_NAME };
        const value = cell.value as any;
        if (value && typeof value === 'object' && Array.isArray(value.richText)) {
          cell.value = {
            ...value,
            richText: value.richText.map((run: any) => ({
              ...run,
              font: { ...(run.font ?? {}), name: EXPORT_FONT_NAME },
            })),
          } as any;
        }
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async getImageBuffer(
    imageUrl?: string | null,
  ): Promise<{ buffer: Buffer; extension: 'png' | 'jpeg' } | null> {
    if (!imageUrl) return null;
    try {
      const cleanUrl = imageUrl.split('?')[0];
      const ext = (cleanUrl.split('.').pop() ?? 'jpeg').toLowerCase();
      const extension: 'png' | 'jpeg' = ext === 'png' ? 'png' : 'jpeg';

      if (imageUrl.includes('/uploads/')) {
        // path.basename() chặn "../" — chỉ giữ tên file cuối cùng, không cho thoát khỏi thư mục uploads.
        const filename = path.basename(imageUrl.split('/uploads/').pop() ?? '');
        if (filename) {
          const localPath = path.join(process.cwd(), 'uploads', filename);
          if (fs.existsSync(localPath)) {
            const buffer = fs.readFileSync(localPath);
            return { buffer, extension };
          }
        }
      }

      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        const resp = await axios.get<ArrayBuffer>(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 8000,
        });
        return { buffer: Buffer.from(resp.data), extension };
      }

      return null;
    } catch {
      return null;
    }
  }

  private async buildDetailResponse(
    doc: ProductionDocument,
  ): Promise<StyleProductionDocDetailResponse> {
    const sections = await this.sectionRepo.find({
      where: { productionDocumentId: doc.id },
      order: { orderIndex: 'ASC' },
    });

    const sizeRows = await this.sizeRowRepo.find({
      where: { productionDocumentId: doc.id },
      order: { orderIndex: 'ASC' },
    });

    const styleDocs = doc.styleId
      ? await this.styleDocRepo.find({
          where: { styleId: doc.styleId },
        })
      : [];

    const attachments = [];
    for (const sd of styleDocs) {
      const d = await this.docRepo.findOne({ where: { id: sd.documentId } });
      if (d) {
        attachments.push({
          documentId: d.id,
          documentCode: d.documentCode || null,
          title: d.title,
          purpose: sd.purpose,
          linkedAt: sd.linkedAt,
        });
      }
    }

    return {
      id: doc.id,
      styleId: doc.styleId,
      name: doc.name,
      description: doc.description,
      status: doc.status,
      section1Description: doc.section1Description,
      section1ImageUrl: doc.section1ImageUrl,
      section2Accessories: doc.section2Accessories,
      section3Notes: doc.section3Notes,
      section4CustomerFeedback: doc.section4CustomerFeedback,
      sizeData: doc.sizeData,
      copiedFromStyleId: doc.copiedFromStyleId,
      copiedAt: doc.copiedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      sections: sections.map((s) => ({
        id: s.id,
        sectionCode: s.sectionCode,
        title: s.title,
        content: s.content,
        imageGroups: s.imageGroups ?? [],
        orderIndex: s.orderIndex,
        isFixed: s.isFixed,
      })),
      sizeRows: sizeRows.map((sr) => ({
        id: sr.id,
        sizeLabel: sr.sizeLabel,
        measurementName: sr.measurementName,
        measurementValue: sr.measurementValue,
        tolerance: sr.tolerance,
        orderIndex: sr.orderIndex,
      })),
      attachments,
    };
  }
}
