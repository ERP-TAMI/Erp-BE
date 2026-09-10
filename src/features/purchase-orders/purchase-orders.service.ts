import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as ExcelJS from 'exceljs';
import * as JSZip from 'jszip';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { PurchaseOrder } from './entities/PurchaseOrder.entity';
import { PurchaseOrderStatusHistory } from './entities/PurchaseOrderStatusHistory.entity';
import { PurchaseOrderDocument } from './entities/PurchaseOrderDocument.entity';
import { PurchaseOrderProduct } from './entities/PurchaseOrderProduct.entity';
import {
  PurchaseOrderProductOperationStep,
  PurchaseOrderProductSampleRound,
  PurchaseOrderProductSampleImage,
  PurchaseOrderProductDocument,
  PurchaseOrderProductStatusHistory,
  PurchaseOrderProductColor,
  PurchaseOrderProductColorSize,
} from './entities';
import {
  Style,
  StyleOperationStep,
  StyleSampleRound,
  StyleSampleImage,
  StyleDocument,
} from '../styles/entities';
import {
  ProductionDocument,
  ProductionDocumentSizeRow,
  ProductionDocumentSection,
  ProductionDocumentImage,
} from '../production/entities';
import { Document } from '../documents/entities/Document.entity';
import { DocumentVersion } from '../documents/entities/DocumentVersion.entity';
import { Customer } from '../master-data/entities/Customer.entity';
import {
  DocumentPurpose,
  PoStatus,
  ProductStatus,
  ProductionDocStatus,
  SampleStatus,
  UploadStatus,
} from '../../common/enums/database.enums';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  QueryPurchaseOrderDto,
  UpdatePoStatusDto,
  LinkPoDocumentDto,
  CreatePoProductDto,
  UpdatePoProductDto,
  SaveProductOperationStepsDto,
  CreateProductSampleRoundDto,
} from './dto';

export interface PaginatedPoResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PoExcelCell {
  value: string;
  image?: string;
  images?: string[];
  rowSpan?: number;
  colSpan?: number;
  isMerged?: boolean;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface PoDocumentPreviewSheet {
  name: string;
  rowCount: number;
  columnCount: number;
  rows: string[][];
  cells?: PoExcelCell[][];
  unanchoredImages?: string[];
}

export interface PoDocumentPreviewResponse {
  type: 'excel' | 'word' | 'pdf' | 'image' | 'text' | 'unsupported';
  fileName: string;
  fileUrl?: string;
  sheets?: PoDocumentPreviewSheet[];
  html?: string;
  text?: string;
}

export interface PurchaseOrderDetailResponse {
  id: string;
  poCode: string;
  customerPoCode: string | null;
  customerId: string | null;
  customerNameSnapshot: string;
  receivedDate: Date;
  note: string | null;
  status: PoStatus;
  cancellationReason: string | null;
  closedAt: Date | null;
  closedBy: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  products: PurchaseOrderProduct[];
  documents: {
    documentId: string;
    documentCode: string | null;
    title: string;
    purpose: string;
    linkedAt: Date;
    fileUrl?: string | null;
    fileName?: string | null;
    fileSize?: number | null;
  }[];
  statusHistory: {
    id: string;
    oldStatus: PoStatus | null;
    newStatus: PoStatus;
    action: string;
    reason: string | null;
    changedBy: string | null;
    changedAt: Date;
  }[];
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderStatusHistory)
    private readonly historyRepo: Repository<PurchaseOrderStatusHistory>,
    @InjectRepository(PurchaseOrderDocument)
    private readonly poDocRepo: Repository<PurchaseOrderDocument>,
    @InjectRepository(PurchaseOrderProduct)
    private readonly productRepo: Repository<PurchaseOrderProduct>,
    @InjectRepository(PurchaseOrderProductOperationStep)
    private readonly productStepRepo: Repository<PurchaseOrderProductOperationStep>,
    @InjectRepository(PurchaseOrderProductSampleRound)
    private readonly productSampleRoundRepo: Repository<PurchaseOrderProductSampleRound>,
    @InjectRepository(PurchaseOrderProductSampleImage)
    private readonly productSampleImageRepo: Repository<PurchaseOrderProductSampleImage>,
    @InjectRepository(PurchaseOrderProductDocument)
    private readonly productDocRepo: Repository<PurchaseOrderProductDocument>,
    @InjectRepository(PurchaseOrderProductStatusHistory)
    private readonly productHistoryRepo: Repository<PurchaseOrderProductStatusHistory>,
    @InjectRepository(PurchaseOrderProductColor)
    private readonly productColorRepo: Repository<PurchaseOrderProductColor>,
    @InjectRepository(PurchaseOrderProductColorSize)
    private readonly productColorSizeRepo: Repository<PurchaseOrderProductColorSize>,
    @InjectRepository(Style)
    private readonly styleRepo: Repository<Style>,
    @InjectRepository(StyleOperationStep)
    private readonly styleStepRepo: Repository<StyleOperationStep>,
    @InjectRepository(StyleSampleRound)
    private readonly styleSampleRoundRepo: Repository<StyleSampleRound>,
    @InjectRepository(StyleSampleImage)
    private readonly styleSampleImageRepo: Repository<StyleSampleImage>,
    @InjectRepository(StyleDocument)
    private readonly styleDocRepo: Repository<StyleDocument>,
    @InjectRepository(ProductionDocument)
    private readonly prodDocRepo: Repository<ProductionDocument>,
    @InjectRepository(ProductionDocumentSizeRow)
    private readonly prodDocSizeRowRepo: Repository<ProductionDocumentSizeRow>,
    @InjectRepository(ProductionDocumentSection)
    private readonly prodDocSectionRepo: Repository<ProductionDocumentSection>,
    @InjectRepository(ProductionDocumentImage)
    private readonly prodDocImageRepo: Repository<ProductionDocumentImage>,
    @InjectRepository(Document)
    private readonly docRepo: Repository<Document>,
    @InjectRepository(DocumentVersion)
    private readonly docVersionRepo: Repository<DocumentVersion>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  async create(
    dto: CreatePurchaseOrderDto,
    userId?: string,
  ): Promise<PurchaseOrderDetailResponse> {
    const existing = await this.poRepo.findOne({
      where: { poCode: dto.poCode },
    });
    if (existing) {
      throw new ConflictException(
        `Mã PO "${dto.poCode}" đã tồn tại trên hệ thống.`,
      );
    }

    let customerId = dto.customerId;
    if (customerId) {
      const exists = await this.customerRepo.findOne({
        where: { id: customerId },
      });
      if (!exists) {
        customerId = undefined;
      }
    }

    if (!customerId && dto.customerNameSnapshot) {
      const existingCustomer = await this.customerRepo.findOne({
        where: { customerName: dto.customerNameSnapshot },
      });
      if (existingCustomer) {
        customerId = existingCustomer.id;
      }
    }

    const now = new Date();
    const poEntity = this.poRepo.create({
      poCode: dto.poCode,
      customerPoCode: dto.customerPoCode || null,
      customerId: customerId || null,
      customerNameSnapshot: dto.customerNameSnapshot,
      receivedDate: new Date(dto.receivedDate),
      note: dto.note || null,
      status: PoStatus.DRAFT,
      createdBy: userId || null,
      createdAt: now,
      updatedAt: now,
    });

    const savedPo = (await this.poRepo.save(
      poEntity,
    )) as unknown as PurchaseOrder;

    const historyRecord = this.historyRepo.create({
      purchaseOrderId: savedPo.id,
      oldStatus: null,
      newStatus: PoStatus.DRAFT,
      action: 'Khởi tạo PO',
      reason: 'Tạo mới đơn hàng PO',
      changedBy: userId || null,
      changedAt: now,
    });
    await this.historyRepo.save(historyRecord);

    return this.findOne(savedPo.id);
  }

  async findAll(
    query: QueryPurchaseOrderDto,
  ): Promise<PaginatedPoResult<PurchaseOrder & { productsCount: number }>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const qb = this.poRepo.createQueryBuilder('po');

    if (query.search?.trim()) {
      const search = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(po.poCode) LIKE :search OR LOWER(COALESCE(po.customerPoCode, '')) LIKE :search OR LOWER(po.customerNameSnapshot) LIKE :search)",
        { search },
      );
    }

    if (query.poCode?.trim()) {
      qb.andWhere('LOWER(po.poCode) LIKE :poCode', {
        poCode: `%${query.poCode.trim().toLowerCase()}%`,
      });
    }

    if (query.customerId?.trim()) {
      qb.andWhere('po.customerId = :customerId', {
        customerId: query.customerId.trim(),
      });
    }

    if (query.status) {
      qb.andWhere('po.status = :status', { status: query.status });
    }

    if (query.dateFrom?.trim()) {
      qb.andWhere('po.receivedDate >= :dateFrom', {
        dateFrom: query.dateFrom.trim(),
      });
    }

    if (query.dateTo?.trim()) {
      qb.andWhere('po.receivedDate <= :dateTo', {
        dateTo: query.dateTo.trim(),
      });
    }

    const sortColumn = query.sortBy || 'createdAt';
    const allowedSortColumns: Record<string, string> = {
      createdAt: 'po.createdAt',
      poCode: 'po.poCode',
      receivedDate: 'po.receivedDate',
      customerNameSnapshot: 'po.customerNameSnapshot',
      status: 'po.status',
    };

    const orderField = allowedSortColumns[sortColumn] || 'po.createdAt';
    const orderDirection = query.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    qb.orderBy(orderField, orderDirection);
    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    // Fetch product counts for returned items
    const poIds = items.map((i) => i.id);
    let countsMap: Record<string, number> = {};
    if (poIds.length > 0) {
      const countsRaw = await this.productRepo
        .createQueryBuilder('p')
        .select('p.purchaseOrderId', 'poId')
        .addSelect('COUNT(p.id)', 'count')
        .where('p.purchaseOrderId IN (:...poIds)', { poIds })
        .groupBy('p.purchaseOrderId')
        .getRawMany();

      countsMap = countsRaw.reduce(
        (acc, row) => {
          acc[row.poId] = Number(row.count) || 0;
          return acc;
        },
        {} as Record<string, number>,
      );
    }

    const itemsWithCounts = items.map((po) => ({
      ...po,
      productsCount: countsMap[po.id] || 0,
    }));

    return {
      items: itemsWithCounts,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findOne(id: string): Promise<PurchaseOrderDetailResponse> {
    const po = await this.poRepo.findOne({ where: { id } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${id}`);
    }

    const poDocs = await this.poDocRepo.find({
      where: { purchaseOrderId: id },
      order: { linkedAt: 'DESC' },
    });

    const docIds = poDocs.map((pd) => pd.documentId);
    let docsMap: Map<string, Document> = new Map();
    let docVersionsMap: Map<string, DocumentVersion> = new Map();

    if (docIds.length > 0) {
      const docs = await this.docRepo.find({ where: { id: In(docIds) } });
      docsMap = new Map(docs.map((d) => [d.id, d]));

      const versionIds = docs
        .map((d) => d.currentVersionId)
        .filter((vId): vId is string => Boolean(vId));
      if (versionIds.length > 0) {
        const versions = await this.docVersionRepo.find({
          where: { id: In(versionIds) },
        });
        docVersionsMap = new Map(versions.map((v) => [v.id, v]));
      }
    }

    const formattedDocs = poDocs.map((pd) => {
      const masterDoc = docsMap.get(pd.documentId);
      const version = masterDoc?.currentVersionId
        ? docVersionsMap.get(masterDoc.currentVersionId)
        : null;
      return {
        documentId: pd.documentId,
        documentCode: masterDoc?.documentCode || null,
        title: masterDoc?.title || 'Tài liệu PO',
        purpose: pd.purpose,
        linkedAt: pd.linkedAt,
        fileUrl: version?.storageKey || null,
        fileName: version?.originalFileName || masterDoc?.title || null,
        fileSize: version?.byteSize ? Number(version.byteSize) : null,
      };
    });

    const products = await this.productRepo.find({
      where: { purchaseOrderId: id },
      order: { createdAt: 'ASC' },
    });

    const history = await this.historyRepo.find({
      where: { purchaseOrderId: id },
      order: { changedAt: 'DESC' },
    });

    return {
      id: po.id,
      poCode: po.poCode,
      customerPoCode: po.customerPoCode,
      customerId: po.customerId,
      customerNameSnapshot: po.customerNameSnapshot,
      receivedDate: po.receivedDate,
      note: po.note,
      status: po.status,
      cancellationReason: po.cancellationReason,
      closedAt: po.closedAt,
      closedBy: po.closedBy,
      createdBy: po.createdBy,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
      products,
      documents: formattedDocs,
      statusHistory: history.map((h) => ({
        id: h.id,
        oldStatus: h.oldStatus,
        newStatus: h.newStatus,
        action: h.action,
        reason: h.reason,
        changedBy: h.changedBy,
        changedAt: h.changedAt,
      })),
    };
  }

  private checkPoNotLocked(po: PurchaseOrder, action: string): void {
    if (po.status === PoStatus.CLOSED) {
      throw new BadRequestException(
        action === 'chỉnh sửa thông tin'
          ? 'PO đã ở trạng thái Đã khóa, chỉ có thể thay đổi thông tin qua luồng điều chỉnh.'
          : `Đơn hàng PO đã khóa, không thể ${action}.`,
      );
    }
    if (po.status === PoStatus.CANCELLED) {
      throw new BadRequestException(`Đơn hàng PO đã hủy, không thể ${action}.`);
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
    userId?: string,
  ): Promise<PurchaseOrderDetailResponse> {
    const po = await this.poRepo.findOne({ where: { id } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${id}`);
    }

    this.checkPoNotLocked(po, 'chỉnh sửa thông tin');

    if (dto.customerPoCode !== undefined) {
      po.customerPoCode = dto.customerPoCode || null;
    }
    if (dto.customerId) {
      po.customerId = dto.customerId;
    }
    if (dto.customerNameSnapshot) {
      po.customerNameSnapshot = dto.customerNameSnapshot;
    }
    if (dto.receivedDate) {
      po.receivedDate = new Date(dto.receivedDate);
    }
    if (dto.note !== undefined) {
      po.note = dto.note || null;
    }

    po.updatedBy = userId || null;
    po.updatedAt = new Date();

    await this.poRepo.save(po);

    return this.findOne(id);
  }

  async updateStatus(
    id: string,
    dto: UpdatePoStatusDto,
    userId?: string,
  ): Promise<PurchaseOrderDetailResponse> {
    const po = await this.poRepo.findOne({ where: { id } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${id}`);
    }

    const currentStatus = po.status;
    const newStatus = dto.status;

    if (currentStatus === newStatus) {
      return this.findOne(id);
    }

    const validTransitions: Record<PoStatus, PoStatus[]> = {
      [PoStatus.DRAFT]: [
        PoStatus.IN_PROGRESS,
        PoStatus.PENDING_RD,
        PoStatus.CANCELLED,
      ],
      [PoStatus.PENDING_RD]: [PoStatus.IN_PROGRESS, PoStatus.CANCELLED],
      [PoStatus.IN_PROGRESS]: [PoStatus.CLOSED, PoStatus.CANCELLED],
      [PoStatus.CLOSED]: [],
      [PoStatus.CANCELLED]: [],
    };

    const allowedNextStatuses = validTransitions[currentStatus] || [];
    if (!allowedNextStatuses.includes(newStatus)) {
      throw new BadRequestException(
        `Không thể chuyển trạng thái từ ${currentStatus} sang ${newStatus}. Vui lòng thực hiện theo đúng luồng: Nháp -> Đang xử lý -> Khóa.`,
      );
    }

    if (
      (newStatus === PoStatus.CLOSED || newStatus === PoStatus.CANCELLED) &&
      !dto.reason?.trim()
    ) {
      throw new BadRequestException(
        'Chuyển trạng thái sang Đã khóa hoặc Đã hủy bắt buộc phải nhập lý do.',
      );
    }

    const now = new Date();
    po.status = newStatus;
    po.updatedAt = now;
    po.updatedBy = userId || null;

    if (newStatus === PoStatus.CLOSED) {
      po.closedAt = now;
      po.closedBy = userId || null;
    } else if (newStatus === PoStatus.CANCELLED) {
      po.cancellationReason = dto.reason?.trim() || null;
    }

    await this.poRepo.save(po);

    const actionText =
      newStatus === PoStatus.PENDING_RD
        ? 'Chuyển sang Chờ R&D'
        : newStatus === PoStatus.IN_PROGRESS
          ? 'Bắt đầu xử lý PO'
          : newStatus === PoStatus.CLOSED
            ? 'Khóa PO'
            : 'Hủy đơn hàng PO';

    const history = this.historyRepo.create({
      purchaseOrderId: id,
      oldStatus: currentStatus,
      newStatus: newStatus,
      action: actionText,
      reason: dto.reason?.trim() || null,
      changedBy: userId || null,
      changedAt: now,
    });
    await this.historyRepo.save(history);

    return this.findOne(id);
  }

  // ─── Documents Management ──────────────────────────────────────────────────

  async linkDocument(
    poId: string,
    dto: LinkPoDocumentDto,
    userId?: string,
  ): Promise<PurchaseOrderDetailResponse> {
    const po = await this.poRepo.findOne({ where: { id: poId } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${poId}`);
    }

    this.checkPoNotLocked(po, 'thay đổi tài liệu');

    const existingLink = await this.poDocRepo.findOne({
      where: { purchaseOrderId: poId, documentId: dto.documentId },
    });

    if (existingLink) {
      existingLink.purpose = dto.purpose;
      if (userId) existingLink.linkedBy = userId;
      await this.poDocRepo.save(existingLink);
    } else {
      const link = this.poDocRepo.create({
        purchaseOrderId: poId,
        documentId: dto.documentId,
        purpose: dto.purpose,
        linkedBy: userId || null,
        linkedAt: new Date(),
      });
      await this.poDocRepo.save(link);
    }

    return this.findOne(poId);
  }

  async updateDocumentPurpose(
    poId: string,
    documentId: string,
    purpose: DocumentPurpose,
    userId?: string,
  ): Promise<PurchaseOrderDetailResponse> {
    const po = await this.poRepo.findOne({ where: { id: poId } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${poId}`);
    }

    this.checkPoNotLocked(po, 'thay đổi phân loại tài liệu');

    const existingLink = await this.poDocRepo.findOne({
      where: { purchaseOrderId: poId, documentId },
    });

    if (!existingLink) {
      throw new NotFoundException(
        `Không tìm thấy tài liệu với ID: ${documentId} trong đơn hàng PO này`,
      );
    }

    existingLink.purpose = purpose;
    if (userId) existingLink.linkedBy = userId;
    await this.poDocRepo.save(existingLink);

    return this.findOne(poId);
  }

  async unlinkDocument(poId: string, documentId: string): Promise<void> {
    const po = await this.poRepo.findOne({ where: { id: poId } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${poId}`);
    }
    this.checkPoNotLocked(po, 'gỡ tài liệu');

    const existingLink = await this.poDocRepo.findOne({
      where: { purchaseOrderId: poId, documentId },
    });

    if (existingLink) {
      await this.poDocRepo.remove(existingLink);
    }
  }

  async findHistory(poId: string): Promise<PurchaseOrderStatusHistory[]> {
    await this.findOne(poId);
    return this.historyRepo.find({
      where: { purchaseOrderId: poId },
      order: { changedAt: 'DESC' },
    });
  }

  validateFileMagicBytes(ext: string, buffer: Buffer): void {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Tệp rỗng hoặc không có dữ liệu.');
    }

    const normalizedExt = (ext || '').toLowerCase();

    switch (normalizedExt) {
      case '.pdf': {
        // PDF files start with %PDF (hex: 25 50 44 46)
        if (
          buffer.length < 4 ||
          buffer.subarray(0, 4).toString('ascii') !== '%PDF'
        ) {
          throw new BadRequestException(
            'Tệp không phải là định dạng PDF hợp lệ (chữ ký magic bytes không khớp).',
          );
        }
        break;
      }

      case '.png': {
        // PNG signature: 89 50 4E 47 0D 0A 1A 0A
        const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        if (
          buffer.length < 8 ||
          !pngSignature.every((byte, i) => buffer[i] === byte)
        ) {
          throw new BadRequestException(
            'Tệp không phải là định dạng PNG hợp lệ (chữ ký magic bytes không khớp).',
          );
        }
        break;
      }

      case '.jpg':
      case '.jpeg': {
        // JPEG starts with FF D8 FF
        if (
          buffer.length < 3 ||
          buffer[0] !== 0xff ||
          buffer[1] !== 0xd8 ||
          buffer[2] !== 0xff
        ) {
          throw new BadRequestException(
            'Tệp không phải là định dạng JPEG/JPG hợp lệ (chữ ký magic bytes không khớp).',
          );
        }
        break;
      }

      case '.gif': {
        // GIF starts with GIF87a or GIF89a
        if (buffer.length < 6) {
          throw new BadRequestException(
            'Tệp không phải là định dạng GIF hợp lệ.',
          );
        }
        const header = buffer.subarray(0, 6).toString('ascii');
        if (header !== 'GIF87a' && header !== 'GIF89a') {
          throw new BadRequestException(
            'Tệp không phải là định dạng GIF hợp lệ (chữ ký magic bytes không khớp).',
          );
        }
        break;
      }

      case '.webp': {
        // WEBP starts with RIFF at offset 0, and WEBP at offset 8
        if (
          buffer.length < 12 ||
          buffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
          buffer.subarray(8, 12).toString('ascii') !== 'WEBP'
        ) {
          throw new BadRequestException(
            'Tệp không phải là định dạng WEBP hợp lệ (chữ ký magic bytes không khớp).',
          );
        }
        break;
      }

      case '.docx':
      case '.xlsx': {
        // Office Open XML (DOCX, XLSX) are ZIP archives: PK\x03\x04 (hex: 50 4B 03 04)
        if (
          buffer.length < 4 ||
          buffer[0] !== 0x50 ||
          buffer[1] !== 0x4b ||
          buffer[2] !== 0x03 ||
          buffer[3] !== 0x04
        ) {
          throw new BadRequestException(
            `Tệp không phải là định dạng ${normalizedExt.toUpperCase()} hợp lệ (chữ ký magic bytes không khớp).`,
          );
        }
        break;
      }

      case '.doc':
      case '.xls': {
        // OLE Compound File: D0 CF 11 E0 A1 B1 1A E1
        const oleSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
        if (
          buffer.length < 8 ||
          !oleSignature.every((byte, i) => buffer[i] === byte)
        ) {
          throw new BadRequestException(
            `Tệp không phải là định dạng ${normalizedExt.toUpperCase()} hợp lệ (chữ ký magic bytes không khớp).`,
          );
        }
        break;
      }

      case '.csv':
      case '.txt': {
        // For text files: reject null bytes and disguised HTML/script tags
        if (buffer.includes(0x00)) {
          throw new BadRequestException(
            `Tệp văn bản "${normalizedExt}" chứa ký tự nhị phân không hợp lệ.`,
          );
        }
        const textSample = buffer
          .subarray(0, Math.min(buffer.length, 4096))
          .toString('utf-8')
          .toLowerCase();
        if (
          textSample.includes('<script') ||
          textSample.includes('<html') ||
          textSample.includes('<!doctype') ||
          textSample.includes('<iframe') ||
          textSample.includes('<svg')
        ) {
          throw new BadRequestException(
            `Tệp văn bản "${normalizedExt}" chứa mã HTML/Script không được phép.`,
          );
        }
        break;
      }

      default:
        throw new BadRequestException(
          `Định dạng tệp "${normalizedExt}" không được hỗ trợ để tải lên.`,
        );
    }
  }

  async uploadDocument(
    poId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    purpose: string = 'other',
    userId?: string,
  ): Promise<{
    documentId: string;
    documentCode: string | null;
    title: string;
    purpose: string;
    linkedAt: Date;
    fileUrl: string;
    fileName: string;
    fileSize: number;
  }> {
    const po = await this.poRepo.findOne({ where: { id: poId } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${poId}`);
    }

    this.checkPoNotLocked(po, 'tải lên tài liệu mới');

    const validPurposes = Object.values(DocumentPurpose);
    const targetPurpose = (purpose || DocumentPurpose.OTHER) as DocumentPurpose;
    if (!validPurposes.includes(targetPurpose)) {
      throw new BadRequestException(
        `Mục đích sử dụng tài liệu không hợp lệ. Các giá trị hợp lệ: ${validPurposes.join(', ')}`,
      );
    }

    const ext = path.extname(file.originalname) || '';
    this.validateFileMagicBytes(ext, file.buffer);

    const uploadDir = path.join(process.cwd(), 'uploads', 'po-documents');
    if (!fs.existsSync(uploadDir)) {
      await fsPromises.mkdir(uploadDir, { recursive: true });
    }

    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(uploadDir, filename);

    if (file.buffer) {
      await fsPromises.writeFile(filePath, file.buffer);
    }

    const storageKey = `/uploads/po-documents/${filename}`;
    const now = new Date();

    try {
      const doc = this.docRepo.create({
        documentCode: `DOC-PO-${Date.now().toString().slice(-6)}`,
        title: file.originalname,
        createdBy: userId || (null as any),
        createdAt: now,
      });
      const savedDoc = (await this.docRepo.save(doc)) as unknown as Document;

      const version = this.docVersionRepo.create({
        documentId: savedDoc.id,
        versionNo: 1,
        originalFileName: file.originalname,
        storageKey,
        mimeType: file.mimetype || 'application/octet-stream',
        byteSize: file.size || 0,
        status: UploadStatus.READY,
        uploadedBy: userId || (null as any),
        uploadedAt: now,
      });
      const savedVersion = (await this.docVersionRepo.save(
        version,
      )) as unknown as DocumentVersion;

      savedDoc.currentVersionId = savedVersion.id;
      await this.docRepo.save(savedDoc);

      const poDoc = this.poDocRepo.create({
        purchaseOrderId: poId,
        documentId: savedDoc.id,
        purpose: targetPurpose,
        linkedBy: userId || (null as any),
        linkedAt: now,
      });
      await this.poDocRepo.save(poDoc);

      return {
        documentId: savedDoc.id,
        documentCode: savedDoc.documentCode,
        title: savedDoc.title,
        purpose: String(targetPurpose),
        linkedAt: now,
        fileUrl: storageKey,
        fileName: file.originalname,
        fileSize: file.size,
      };
    } catch (error) {
      if (fs.existsSync(filePath)) {
        await fsPromises.unlink(filePath).catch(() => {});
      }
      throw error;
    }
  }

  async uploadMultipleDocuments(
    poId: string,
    files: any[],
    purpose: string = 'other',
    userId?: string,
  ): Promise<
    {
      documentId: string;
      documentCode: string | null;
      title: string;
      purpose: string;
      linkedAt: Date;
      fileUrl: string;
      fileName: string;
      fileSize: number;
    }[]
  > {
    const po = await this.poRepo.findOne({ where: { id: poId } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${poId}`);
    }
    this.checkPoNotLocked(po, 'tải lên tài liệu mới');

    const results: {
      documentId: string;
      documentCode: string | null;
      title: string;
      purpose: string;
      linkedAt: Date;
      fileUrl: string;
      fileName: string;
      fileSize: number;
    }[] = [];

    for (const file of files) {
      const doc = await this.uploadDocument(poId, file, purpose, userId);
      results.push(doc);
    }

    return results;
  }

  private formatExcelCellValue(cell: any): string {
    if (cell === null || cell === undefined) return '';
    if (typeof cell === 'object') {
      if ('result' in cell) return String((cell as any).result ?? '');
      if ('richText' in cell && Array.isArray((cell as any).richText)) {
        return (cell as any).richText.map((rt: any) => rt.text || '').join('');
      }
      if ('text' in cell) return String((cell as any).text ?? '');
    }
    return String(cell);
  }

  private columnNameToNumber(name: string): number {
    let sum = 0;
    for (let i = 0; i < name.length; i++) {
      const code = name.toUpperCase().charCodeAt(i);
      if (code >= 65 && code <= 90) {
        sum = sum * 26 + (code - 64);
      }
    }
    return sum || 1;
  }

  private async parseDocxToHtml(buffer: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(buffer);
    const xmlFile = zip.file('word/document.xml');
    if (!xmlFile) {
      return '<p class="text-gray-500 italic">Không tìm thấy nội dung văn bản Word trong tệp.</p>';
    }
    const xml = await xmlFile.async('string');

    // Extract embedded images from relationships
    const imageMap = new Map<string, string>();
    try {
      const relsFile = zip.file('word/_rels/document.xml.rels');
      if (relsFile) {
        const relsXml = await relsFile.async('string');
        const relMatches = relsXml.matchAll(
          /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/gi,
        );
        for (const rm of relMatches) {
          const id = rm[1];
          let target = rm[2];
          if (target.startsWith('/')) target = target.slice(1);
          const zipPath = target.startsWith('word/')
            ? target
            : `word/${target}`;
          const imgZipFile = zip.file(zipPath);
          if (imgZipFile) {
            const ext =
              path.extname(target).toLowerCase().replace('.', '') || 'png';
            const mime =
              ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
            const imgBuf = await imgZipFile.async('nodebuffer');
            imageMap.set(
              id,
              `data:${mime};base64,${imgBuf.toString('base64')}`,
            );
          }
        }
      }
    } catch {
      // Ignore rels errors, proceed with text parsing
    }

    let html = '';
    const blockRegex = /<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g;
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(xml)) !== null) {
      const block = match[0];
      if (match[1] === 'p') {
        const isHeading = /<w:pStyle\s+w:val="Heading(\d)"/i.exec(block);
        let pText = '';
        const tMatches = block.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g);
        for (const t of tMatches) {
          pText += t[1];
        }
        const trimmed = pText.trim();

        // Check for images embedded in this paragraph
        let imgHtml = '';
        const blipMatches = block.matchAll(
          /<(?:a:blip|v:imagedata)[^>]+(?:r:embed|r:id)="([^"]+)"/gi,
        );
        for (const bm of blipMatches) {
          const relId = bm[1];
          const imgData = imageMap.get(relId);
          if (imgData) {
            imgHtml += `<div class="my-3 text-center"><img src="${imgData}" class="max-h-96 max-w-full rounded shadow-sm inline-block object-contain" alt="Hình ảnh tài liệu" /></div>`;
          }
        }

        if (imgHtml) {
          html += imgHtml;
        }

        if (trimmed) {
          const safeText = this.escapeHtml(trimmed);
          if (isHeading) {
            const level = Math.min(6, parseInt(isHeading[1], 10));
            html += `<h${level} class="font-bold text-lg text-gray-900 dark:text-white my-2">${safeText}</h${level}>`;
          } else {
            html += `<p class="text-gray-800 dark:text-gray-200 my-1 leading-relaxed">${safeText}</p>`;
          }
        }
      } else if (match[1] === 'tbl') {
        html +=
          '<div class="overflow-x-auto my-3"><table class="w-full border-collapse border border-gray-200 dark:border-gray-700 text-sm">';
        const trMatches = block.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g);
        for (const tr of trMatches) {
          html +=
            '<tr class="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-800/40">';
          const tcMatches = tr[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g);
          for (const tc of tcMatches) {
            let cellText = '';
            const tMatches = tc[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g);
            for (const t of tMatches) {
              cellText += (cellText ? ' ' : '') + t[1];
            }
            const safeCellText = this.escapeHtml(cellText.trim());
            html += `<td class="border border-gray-200 dark:border-gray-700 p-2 text-gray-800 dark:text-gray-200">${safeCellText}</td>`;
          }
          html += '</tr>';
        }
        html += '</table></div>';
      }
    }
    return (
      html ||
      '<p class="text-gray-500 italic">Tài liệu không có nội dung văn bản hiển thị.</p>'
    );
  }

  async previewDocument(
    poId: string,
    documentId: string,
    versionId?: string,
  ): Promise<PoDocumentPreviewResponse> {
    const poDoc = await this.poDocRepo.findOne({
      where: { purchaseOrderId: poId, documentId },
    });
    if (!poDoc) {
      throw new NotFoundException('Tài liệu không thuộc đơn hàng PO này.');
    }

    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) {
      throw new NotFoundException('Không tìm thấy thông tin tài liệu.');
    }

    let version: DocumentVersion | null = null;
    if (versionId) {
      version = await this.docVersionRepo.findOne({
        where: { id: versionId, documentId },
      });
    } else if (doc.currentVersionId) {
      version = await this.docVersionRepo.findOne({
        where: { id: doc.currentVersionId },
      });
    }
    if (!version) {
      const versions = await this.docVersionRepo.find({
        where: { documentId },
        order: { versionNo: 'DESC' },
        take: 1,
      });
      version = versions[0] || null;
    }

    if (!version) {
      throw new NotFoundException(
        'Không tìm thấy phiên bản tệp tin của tài liệu này.',
      );
    }

    const relativePath = version.storageKey.startsWith('/')
      ? version.storageKey.slice(1)
      : version.storageKey;
    const filePath = path.join(process.cwd(), relativePath);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(
        'Tệp tin vật lý không tồn tại trên hệ thống.',
      );
    }

    const ext = path
      .extname(version.originalFileName || version.storageKey)
      .toLowerCase();

    if (ext === '.xlsx' || ext === '.xls') {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(filePath);
      const sheets: PoDocumentPreviewSheet[] = wb.worksheets.map((ws) => {
        const maxRows = Math.max(ws.rowCount || 0, ws.actualRowCount || 0);
        const maxCols = Math.max(
          ws.columnCount || 0,
          ws.actualColumnCount || 0,
        );

        // 1. Build map of merged cells
        const mergeSpans = new Map<
          string,
          { rowSpan: number; colSpan: number }
        >();
        const slaveCellSet = new Set<string>();

        const mergesObj = (ws as any)._merges;
        if (mergesObj && typeof mergesObj === 'object') {
          for (const key of Object.keys(mergesObj)) {
            const m = mergesObj[key]?.model;
            if (
              m &&
              typeof m.top === 'number' &&
              typeof m.bottom === 'number' &&
              typeof m.left === 'number' &&
              typeof m.right === 'number'
            ) {
              const rowSpan = m.bottom - m.top + 1;
              const colSpan = m.right - m.left + 1;
              mergeSpans.set(`${m.top},${m.left}`, { rowSpan, colSpan });

              for (let r = m.top; r <= m.bottom; r++) {
                for (let c = m.left; c <= m.right; c++) {
                  if (r !== m.top || c !== m.left) {
                    slaveCellSet.add(`${r},${c}`);
                  }
                }
              }
            }
          }
        }

        // 2. Extract embedded images
        const cellImageMap = new Map<string, string[]>();
        const unanchoredImages: string[] = [];

        try {
          const wsImages = ws.getImages ? ws.getImages() : [];
          for (const img of wsImages) {
            let r = 1;
            let c = 1;
            let hasAnchor = false;

            const rawRange = img.range as any;
            if (typeof rawRange === 'string') {
              const match = rawRange.match(/([A-Za-z]+)(\d+)/);
              if (match) {
                c = this.columnNameToNumber(match[1]);
                r = parseInt(match[2], 10);
                hasAnchor = true;
              }
            } else if (rawRange && typeof rawRange === 'object') {
              const tl = rawRange.tl;
              if (tl) {
                if (typeof tl.nativeRow === 'number') {
                  r = tl.nativeRow + 1;
                  hasAnchor = true;
                } else if (typeof tl.row === 'number') {
                  r = Math.floor(tl.row);
                  hasAnchor = true;
                }
                if (typeof tl.nativeCol === 'number') {
                  c = tl.nativeCol + 1;
                  hasAnchor = true;
                } else if (typeof tl.col === 'number') {
                  c = Math.floor(tl.col);
                  hasAnchor = true;
                }
              }
            }

            const media = wb.getImage(Number(img.imageId));
            if (media && media.buffer) {
              const extName = (media.extension || 'png')
                .toLowerCase()
                .replace('.', '');
              const mime =
                extName === 'jpg' || extName === 'jpeg'
                  ? 'image/jpeg'
                  : `image/${extName}`;
              const dataUrl = `data:${mime};base64,${Buffer.from(media.buffer).toString('base64')}`;

              if (hasAnchor) {
                // If target cell is inside a merge, redirect image to master cell
                const cell = ws.getCell(r, c);
                let targetR = r;
                let targetC = c;
                if (cell?.isMerged && cell.master) {
                  targetR = Number(cell.master.row) || r;
                  targetC = Number(cell.master.col) || c;
                }
                const key = `${targetR},${targetC}`;
                const list = cellImageMap.get(key) || [];
                list.push(dataUrl);
                cellImageMap.set(key, list);
              } else {
                unanchoredImages.push(dataUrl);
              }
            }
          }
        } catch {
          // Gracefully continue if drawing/image extraction fails
        }

        // 3. Build cell matrix
        const cells: PoExcelCell[][] = [];
        const rows: string[][] = [];

        for (let r = 1; r <= maxRows; r++) {
          const rowCells: PoExcelCell[] = [];
          const rowValues: string[] = [];
          for (let c = 1; c <= maxCols; c++) {
            const cell = ws.getCell(r, c);
            const rawVal = this.formatExcelCellValue(cell?.value);
            rowValues.push(rawVal);

            const masterR = cell?.master ? Number(cell.master.row) : null;
            const masterC = cell?.master ? Number(cell.master.col) : null;
            const isSlave =
              slaveCellSet.has(`${r},${c}`) ||
              (cell?.isMerged &&
                cell.master &&
                (masterR !== r || masterC !== c));

            const cellKey = `${r},${c}`;
            const images = cellImageMap.get(cellKey);
            const span = mergeSpans.get(cellKey);

            const bold = Boolean(cell?.font?.bold);
            let align: 'left' | 'center' | 'right' | undefined;
            if (cell?.alignment?.horizontal === 'center') align = 'center';
            else if (cell?.alignment?.horizontal === 'right') align = 'right';
            else if (cell?.alignment?.horizontal === 'left') align = 'left';

            rowCells.push({
              value: rawVal,
              image: images?.[0],
              images: images && images.length > 1 ? images : undefined,
              rowSpan: span && span.rowSpan > 1 ? span.rowSpan : undefined,
              colSpan: span && span.colSpan > 1 ? span.colSpan : undefined,
              isMerged: isSlave ? true : undefined,
              bold: bold ? true : undefined,
              align,
            });
          }
          cells.push(rowCells);
          rows.push(rowValues);
        }

        return {
          name: ws.name,
          rowCount: maxRows,
          columnCount: maxCols,
          rows,
          cells,
          unanchoredImages:
            unanchoredImages.length > 0 ? unanchoredImages : undefined,
        };
      });

      return {
        type: 'excel',
        fileName: version.originalFileName,
        fileUrl: version.storageKey,
        sheets,
      };
    }

    if (ext === '.docx') {
      const fileBuf = await fsPromises.readFile(filePath);
      const html = await this.parseDocxToHtml(fileBuf);
      return {
        type: 'word',
        fileName: version.originalFileName,
        fileUrl: version.storageKey,
        html,
      };
    }

    if (ext === '.pdf') {
      return {
        type: 'pdf',
        fileName: version.originalFileName,
        fileUrl: version.storageKey,
      };
    }

    if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext)) {
      return {
        type: 'image',
        fileName: version.originalFileName,
        fileUrl: version.storageKey,
      };
    }

    if (['.txt', '.csv', '.json', '.md'].includes(ext)) {
      const text = await fsPromises.readFile(filePath, 'utf-8');
      return {
        type: 'text',
        fileName: version.originalFileName,
        fileUrl: version.storageKey,
        text,
      };
    }

    return {
      type: 'unsupported',
      fileName: version.originalFileName,
      fileUrl: version.storageKey,
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PO PRODUCTS & FIT IMPORT LOGIC
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Lấy bản xem trước dữ liệu Style (Fit) trước khi import vào Product
   */
  async getImportFitPreview(styleId: string) {
    const style = await this.styleRepo.findOne({ where: { id: styleId } });
    if (!style) {
      throw new NotFoundException(
        `Không tìm thấy Style Fit với ID: ${styleId}`,
      );
    }

    // 1. Lấy danh sách công đoạn
    const operationSteps = await this.styleStepRepo.find({
      where: { styleId },
      order: { orderIndex: 'ASC' },
    });

    // 2. Lấy danh sách vòng mẫu
    const sampleRounds = await this.styleSampleRoundRepo.find({
      where: { styleId },
      order: { roundNo: 'ASC' },
    });

    // Lấy ảnh đính kèm từng vòng mẫu nếu có
    const roundIds = sampleRounds.map((r) => r.id);
    const sampleImagesMap: Map<string, StyleSampleImage[]> = new Map();
    if (roundIds.length > 0) {
      const sampleImages = await this.styleSampleImageRepo.find({
        where: { sampleRoundId: In(roundIds) },
        order: { orderIndex: 'ASC' },
      });
      for (const img of sampleImages) {
        const list = sampleImagesMap.get(img.sampleRoundId) || [];
        list.push(img);
        sampleImagesMap.set(img.sampleRoundId, list);
      }
    }

    // 3. Lấy tài liệu sản xuất tiếng Việt
    const prodDoc = await this.prodDocRepo.findOne({ where: { styleId } });
    let prodDocSections: ProductionDocumentSection[] = [];
    let prodDocSizeRows: ProductionDocumentSizeRow[] = [];
    if (prodDoc) {
      prodDocSections = await this.prodDocSectionRepo.find({
        where: { productionDocumentId: prodDoc.id },
        order: { orderIndex: 'ASC' },
      });
      prodDocSizeRows = await this.prodDocSizeRowRepo.find({
        where: { productionDocumentId: prodDoc.id },
        order: { orderIndex: 'ASC' },
      });
    }

    // 4. Lấy tài liệu kỹ thuật đính kèm
    const styleDocs = await this.styleDocRepo.find({ where: { styleId } });
    const docIds = styleDocs.map((sd) => sd.documentId);
    let docsMap: Map<string, Document> = new Map();
    if (docIds.length > 0) {
      const docs = await this.docRepo.find({ where: { id: In(docIds) } });
      docsMap = new Map(docs.map((d) => [d.id, d]));
    }

    return {
      style: {
        id: style.id,
        styleCode: style.styleCode,
        styleName: style.styleName,
        category: style.category,
        as3bCmBaseDays: style.as3bCmBaseDays,
        baseImageVersionId: style.baseImageVersionId,
      },
      operationSteps: operationSteps.map((step) => ({
        id: step.id,
        stepName: step.stepName,
        description: step.description,
        timePerPiece: Number(step.timePerPiece),
        ssv: Number(step.ssv),
        targetTotal: step.targetTotal,
        note: step.note,
        orderIndex: step.orderIndex,
        isGroup: step.isGroup,
      })),
      sampleRounds: sampleRounds.map((round) => ({
        id: round.id,
        roundNo: round.roundNo,
        sampleDate: round.sampleDate,
        feedback: round.feedback,
        status: round.status,
        imageCount: (sampleImagesMap.get(round.id) || []).length,
      })),
      productionDocument: prodDoc
        ? {
            id: prodDoc.id,
            name: prodDoc.name,
            status: prodDoc.status,
            sectionCount: prodDocSections.length,
            sizeRowCount: prodDocSizeRows.length,
            hasDescription: Boolean(prodDoc.section1Description),
            hasAccessories: Boolean(prodDoc.section2Accessories),
          }
        : null,
      documents: styleDocs.map((sd) => ({
        documentId: sd.documentId,
        purpose: sd.purpose,
        title: docsMap.get(sd.documentId)?.title || 'Tài liệu Style',
        documentCode: docsMap.get(sd.documentId)?.documentCode || null,
      })),
    };
  }

  /**
   * Lấy danh sách sản phẩm trong PO kèm đếm thống kê và thông tin truy vết Style nguồn
   */
  async getProducts(poId: string) {
    const products = await this.productRepo.find({
      where: { purchaseOrderId: poId },
      order: { createdAt: 'ASC' },
    });

    if (products.length === 0) return [];

    const productIds = products.map((p) => p.id);
    const styleIds = products
      .map((p) => p.sourceStyleId)
      .filter((sId): sId is string => Boolean(sId));

    // Lấy thông tin Style nguồn để hiển thị
    let stylesMap: Map<string, Style> = new Map();
    if (styleIds.length > 0) {
      const styles = await this.styleRepo.find({
        where: { id: In(styleIds) },
      });
      stylesMap = new Map(styles.map((s) => [s.id, s]));
    }

    // Đếm số công đoạn, số mẫu, số tài liệu cho từng Product
    const [
      stepsCountRaw,
      samplesCountRaw,
      docsCountRaw,
      allProductDocs,
      allColors,
    ] = await Promise.all([
      this.productStepRepo
        .createQueryBuilder('step')
        .select('step.productId', 'productId')
        .addSelect('COUNT(step.id)', 'count')
        .where('step.productId IN (:...productIds)', { productIds })
        .groupBy('step.productId')
        .getRawMany(),
      this.productSampleRoundRepo
        .createQueryBuilder('sample')
        .select('sample.productId', 'productId')
        .addSelect('COUNT(sample.id)', 'count')
        .where('sample.productId IN (:...productIds)', { productIds })
        .groupBy('sample.productId')
        .getRawMany(),
      this.productDocRepo
        .createQueryBuilder('doc')
        .select('doc.productId', 'productId')
        .addSelect('COUNT(doc.documentId)', 'count')
        .where('doc.productId IN (:...productIds)', { productIds })
        .groupBy('doc.productId')
        .getRawMany(),
      this.productDocRepo.find({
        where: { productId: In(productIds) },
        order: { linkedAt: 'ASC' },
      }),
      this.productColorRepo.find({
        where: { productId: In(productIds) },
        order: { orderIndex: 'ASC' },
      }),
    ]);

    // Lấy tất cả size của các colors này
    const colorIds = allColors.map((c) => c.id);
    let allSizes: PurchaseOrderProductColorSize[] = [];
    if (colorIds.length > 0) {
      allSizes = await this.productColorSizeRepo.find({
        where: { productColorId: In(colorIds) },
        order: { orderIndex: 'ASC' },
      });
    }

    const sizesByColorId = allSizes.reduce(
      (acc, s) => {
        if (!acc[s.productColorId]) acc[s.productColorId] = [];
        acc[s.productColorId].push(s);
        return acc;
      },
      {} as Record<string, PurchaseOrderProductColorSize[]>,
    );

    const colorsByProductId = allColors.reduce(
      (acc, c) => {
        if (!acc[c.productId]) acc[c.productId] = [];
        const colorSizes = sizesByColorId[c.id] || [];
        const colorQty = colorSizes.reduce(
          (sum, s) => sum + (Number(s.quantity) || 0),
          0,
        );
        acc[c.productId].push({
          id: c.id,
          colorName: c.colorName,
          colorCode: c.colorCode,
          orderIndex: c.orderIndex,
          sizes: colorSizes.map((s) => ({
            id: s.id,
            sizeLabel: s.sizeLabel,
            quantity: Number(s.quantity) || 0,
            orderIndex: s.orderIndex,
          })),
          totalQuantity: colorQty,
        });
        return acc;
      },
      {} as Record<string, any[]>,
    );

    const stepsCountMap = stepsCountRaw.reduce(
      (acc, r) => {
        acc[r.productId] = Number(r.count) || 0;
        return acc;
      },
      {} as Record<string, number>,
    );

    const samplesCountMap = samplesCountRaw.reduce(
      (acc, r) => {
        acc[r.productId] = Number(r.count) || 0;
        return acc;
      },
      {} as Record<string, number>,
    );

    const docsCountMap = docsCountRaw.reduce(
      (acc, r) => {
        acc[r.productId] = Number(r.count) || 0;
        return acc;
      },
      {} as Record<string, number>,
    );

    const productDocsMap = (allProductDocs || []).reduce(
      (
        acc: Record<
          string,
          Array<{ documentId: string; purpose?: string; linkedAt?: Date }>
        >,
        doc,
      ) => {
        if (!acc[doc.productId]) acc[doc.productId] = [];
        acc[doc.productId].push({
          documentId: doc.documentId,
          purpose: doc.purpose,
          linkedAt: doc.linkedAt,
        });
        return acc;
      },
      {},
    );

    return products.map((prod) => {
      const sourceStyle = prod.sourceStyleId
        ? stylesMap.get(prod.sourceStyleId)
        : null;
      const productColors = colorsByProductId[prod.id] || [];
      const totalQuantity = productColors.reduce(
        (sum, c) => sum + (Number(c.totalQuantity) || 0),
        0,
      );

      return {
        ...prod,
        totalQuantity,
        colors: productColors,
        sourceStyle: sourceStyle
          ? {
              id: sourceStyle.id,
              styleCode: sourceStyle.styleCode,
              styleName: sourceStyle.styleName,
              category: sourceStyle.category,
            }
          : null,
        stepsCount: stepsCountMap[prod.id] || 0,
        samplesCount: samplesCountMap[prod.id] || 0,
        documentsCount: docsCountMap[prod.id] || 0,
        documents: productDocsMap[prod.id] || [],
      };
    });
  }

  /**
   * Lấy chi tiết một sản phẩm trong PO kèm các dữ liệu con
   */
  async getProductDetail(poId: string, productId: string) {
    const product = await this.productRepo.findOne({
      where: { id: productId, purchaseOrderId: poId },
    });
    if (!product) {
      throw new NotFoundException(
        `Không tìm thấy sản phẩm #${productId} trong đơn hàng PO`,
      );
    }

    const [
      sourceStyle,
      steps,
      sampleRounds,
      prodDoc,
      productDocs,
      history,
      rawColors,
    ] = await Promise.all([
      product.sourceStyleId
        ? this.styleRepo.findOne({ where: { id: product.sourceStyleId } })
        : Promise.resolve(null),
      this.productStepRepo.find({
        where: { productId },
        order: { orderIndex: 'ASC' },
      }),
      this.productSampleRoundRepo.find({
        where: { productId },
        order: { roundNo: 'ASC' },
      }),
      this.prodDocRepo.findOne({
        where: { productId },
      }),
      this.productDocRepo.find({
        where: { productId },
        order: { linkedAt: 'DESC' },
      }),
      this.productHistoryRepo.find({
        where: { productId },
        order: { changedAt: 'DESC' },
      }),
      this.productColorRepo.find({
        where: { productId },
        order: { orderIndex: 'ASC' },
      }),
    ]);

    // Lấy thông tin tài liệu đính kèm Product kèm theo toàn bộ phiên bản
    let docsWithInfo: any[] = [];
    if (productDocs.length > 0) {
      const docIds = productDocs.map((pd) => pd.documentId);
      const docs = await this.docRepo.find({ where: { id: In(docIds) } });
      const docsMap = new Map(docs.map((d) => [d.id, d]));
      const allVersions = await this.docVersionRepo.find({
        where: { documentId: In(docIds) },
        order: { versionNo: 'DESC' },
      });
      const versionsByDoc = allVersions.reduce(
        (acc, v) => {
          if (!acc[v.documentId]) acc[v.documentId] = [];
          acc[v.documentId].push(v);
          return acc;
        },
        {} as Record<string, DocumentVersion[]>,
      );

      docsWithInfo = productDocs.map((pd) => {
        const masterDoc = docsMap.get(pd.documentId);
        const docVersions = versionsByDoc[pd.documentId] || [];
        const currentVersion =
          (masterDoc?.currentVersionId &&
            docVersions.find((v) => v.id === masterDoc.currentVersionId)) ||
          docVersions[0] ||
          null;

        return {
          ...pd,
          title:
            masterDoc?.title || currentVersion?.originalFileName || 'Tài liệu',
          documentCode: masterDoc?.documentCode || null,
          fileName:
            currentVersion?.originalFileName || masterDoc?.title || null,
          fileUrl: currentVersion?.storageKey || null,
          fileSize: currentVersion?.byteSize
            ? Number(currentVersion.byteSize)
            : null,
          currentVersionNo: currentVersion?.versionNo || 1,
          changeReason: currentVersion?.changeReason || null,
          versions: docVersions.map((v) => ({
            id: v.id,
            versionNo: v.versionNo,
            originalFileName: v.originalFileName,
            fileUrl: v.storageKey,
            fileSize: v.byteSize ? Number(v.byteSize) : null,
            mimeType: v.mimeType,
            changeReason: v.changeReason,
            uploadedAt: v.uploadedAt,
            uploadedBy: v.uploadedBy,
          })),
        };
      });
    }

    // Lấy thông tin sizes của các colors
    let colorsWithSizes: any[] = [];
    let totalQuantity = 0;
    if (rawColors.length > 0) {
      const colorIds = rawColors.map((c) => c.id);
      const sizes = await this.productColorSizeRepo.find({
        where: { productColorId: In(colorIds) },
        order: { orderIndex: 'ASC' },
      });
      const sizesByColor = sizes.reduce(
        (acc, s) => {
          if (!acc[s.productColorId]) acc[s.productColorId] = [];
          acc[s.productColorId].push({
            id: s.id,
            sizeLabel: s.sizeLabel,
            quantity: Number(s.quantity) || 0,
            orderIndex: s.orderIndex,
          });
          totalQuantity += Number(s.quantity) || 0;
          return acc;
        },
        {} as Record<string, any[]>,
      );

      colorsWithSizes = rawColors.map((c) => {
        const colorSizes = sizesByColor[c.id] || [];
        const colorQty = colorSizes.reduce(
          (sum, s) => sum + (Number(s.quantity) || 0),
          0,
        );
        return {
          id: c.id,
          colorName: c.colorName,
          colorCode: c.colorCode,
          orderIndex: c.orderIndex,
          sizes: colorSizes,
          totalQuantity: colorQty,
        };
      });
    }

    return {
      ...product,
      totalQuantity,
      colors: colorsWithSizes,
      sourceStyle: sourceStyle
        ? {
            id: sourceStyle.id,
            styleCode: sourceStyle.styleCode,
            styleName: sourceStyle.styleName,
            category: sourceStyle.category,
          }
        : null,
      operationSteps: steps,
      sampleRounds,
      productionDocument: prodDoc,
      documents: docsWithInfo,
      statusHistory: history,
    };
  }

  /**
   * Tạo mới Product trong PO (có thể tạo độc lập hoặc import deep clone từ Style)
   * Đảm bảo sau khi import là bản riêng của Product, sửa/xóa không ảnh hưởng Style nguồn.
   */
  async addProduct(
    poId: string,
    dto: CreatePoProductDto,
    userId?: string,
  ): Promise<PurchaseOrderProduct> {
    const po = await this.poRepo.findOne({ where: { id: poId } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy PO #${poId}`);
    }
    if (po.status === PoStatus.CLOSED || po.status === PoStatus.CANCELLED) {
      throw new BadRequestException(
        'Đơn hàng PO đã khóa hoặc đã hủy, không thể thêm sản phẩm',
      );
    }

    const rawCode = (dto.productCode || dto.styleCode || '').trim();
    if (!rawCode) {
      throw new BadRequestException(
        'Mã sản phẩm (productCode) không được để trống',
      );
    }

    // Kiểm tra trùng mã sản phẩm trong PO này
    const existingCode = await this.productRepo.findOne({
      where: { purchaseOrderId: poId, productCode: rawCode },
    });
    if (existingCode) {
      throw new ConflictException(
        `Mã sản phẩm "${rawCode}" đã tồn tại trong đơn hàng PO này`,
      );
    }

    const sourceStyleId = dto.sourceStyleId || dto.styleId || null;
    let sourceStyle: Style | null = null;
    if (sourceStyleId) {
      sourceStyle = await this.styleRepo.findOne({
        where: { id: sourceStyleId },
      });
      if (!sourceStyle) {
        throw new NotFoundException(
          `Không tìm thấy Style nguồn #${sourceStyleId}`,
        );
      }
    }

    const targetCategory = dto.category || sourceStyle?.category || undefined;
    const targetName = (
      dto.productName ||
      sourceStyle?.styleName ||
      rawCode
    ).trim();
    const targetDeadline = dto.deadline ? new Date(dto.deadline) : null;
    const targetCmDays =
      dto.as3bCmBaseDays || sourceStyle?.as3bCmBaseDays || 30;

    return await this.dataSource.transaction(async (manager) => {
      // 1. Tạo PurchaseOrderProduct
      const newProduct = manager.create(PurchaseOrderProduct, {
        purchaseOrderId: poId,
        sourceStyleId: sourceStyleId || undefined,
        productCode: rawCode,
        productName: targetName,
        category: targetCategory,
        materialNote: dto.materialNote || dto.colorName || undefined,
        deadline: targetDeadline || undefined,
        structureImageVersionId:
          dto.structureImageVersionId ||
          sourceStyle?.baseImageVersionId ||
          null,
        status: ProductStatus.DRAFT,
        as3bCmBaseDays: targetCmDays,
        importedAt: sourceStyleId ? new Date() : undefined,
        importedBy: sourceStyleId ? userId : undefined,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const savedProduct = await manager.save(PurchaseOrderProduct, newProduct);

      // 2. Kế thừa từ Style nguồn (Deep Clone độc lập) nếu có chọn import
      if (sourceStyleId) {
        const opts = dto.importOptions || {};

        // 2.1. Clone Công đoạn AS3B (StyleOperationStep -> PurchaseOrderProductOperationStep)
        if (opts.copySteps !== false) {
          const styleSteps = await manager.find(StyleOperationStep, {
            where: { styleId: sourceStyleId },
            order: { orderIndex: 'ASC' },
          });

          const stepsToCopy = opts.selectedStepIds?.length
            ? styleSteps.filter((s) => opts.selectedStepIds?.includes(s.id))
            : styleSteps;

          if (stepsToCopy.length > 0) {
            const stepIdMap = new Map<string, string>();
            stepsToCopy.forEach((s) => stepIdMap.set(s.id, randomUUID()));

            const productSteps = stepsToCopy.map((s) => {
              const entity = new PurchaseOrderProductOperationStep();
              entity.id = stepIdMap.get(s.id)!;
              entity.productId = savedProduct.id;
              entity.sourceStyleStepId = s.id;
              entity.parentStepId = s.parentStepId
                ? stepIdMap.get(s.parentStepId) || (null as any)
                : (null as any);
              entity.stageId = (s.stageId || null) as any;
              entity.stepName = s.stepName;
              entity.description = (s.description || null) as any;
              entity.timePerPiece = s.timePerPiece;
              entity.ssv = s.ssv;
              entity.targetTotal = s.targetTotal;
              entity.note = (s.note || null) as any;
              entity.orderIndex = s.orderIndex;
              entity.isGroup = s.isGroup;
              return entity;
            });
            await manager.save(PurchaseOrderProductOperationStep, productSteps);
          }
        }

        // 2.2. Clone Vòng mẫu & ảnh mẫu (StyleSampleRound -> PurchaseOrderProductSampleRound)
        if (opts.copySamples !== false) {
          const styleRounds = await manager.find(StyleSampleRound, {
            where: { styleId: sourceStyleId },
            order: { roundNo: 'ASC' },
          });

          const roundsToCopy = opts.selectedSampleRoundIds?.length
            ? styleRounds.filter((r) =>
                opts.selectedSampleRoundIds?.includes(r.id),
              )
            : styleRounds;

          for (const round of roundsToCopy) {
            const newRound = manager.create(PurchaseOrderProductSampleRound, {
              productId: savedProduct.id,
              sourceStyleSampleRoundId: round.id,
              roundNo: round.roundNo,
              sampleDate: round.sampleDate || new Date(),
              feedback: round.feedback,
              status: round.status,
              createdBy: userId,
              createdAt: new Date(),
            });
            const savedRound = await manager.save(
              PurchaseOrderProductSampleRound,
              newRound,
            );

            // Clone các ảnh đính kèm của round
            const roundImages = await manager.find(StyleSampleImage, {
              where: { sampleRoundId: round.id },
              order: { orderIndex: 'ASC' },
            });
            if (roundImages.length > 0) {
              const productImages = roundImages.map((img) =>
                manager.create(PurchaseOrderProductSampleImage, {
                  sampleRoundId: savedRound.id,
                  documentVersionId: img.documentVersionId,
                  colorNameSnapshot: img.colorName || undefined,
                  orderIndex: img.orderIndex,
                }),
              );
              await manager.save(
                PurchaseOrderProductSampleImage,
                productImages,
              );
            }
          }
        }

        // 2.3. Clone Tài liệu sản xuất tiếng Việt (ProductionDocument -> ProductionDocument for Product)
        if (opts.copyProductionDoc !== false) {
          const styleDoc = await manager.findOne(ProductionDocument, {
            where: { styleId: sourceStyleId },
          });
          if (styleDoc) {
            const productDoc = manager.create(ProductionDocument, {
              productId: savedProduct.id,
              styleId: null,
              name: `Tài liệu SX - ${savedProduct.productCode}`,
              description: styleDoc.description,
              status: ProductionDocStatus.DRAFT,
              sourceDocumentId: styleDoc.id,
              copiedFromStyleId: sourceStyleId,
              copiedAt: new Date(),
              section1Description: styleDoc.section1Description,
              section1ImageUrl: styleDoc.section1ImageUrl,
              section2Accessories: styleDoc.section2Accessories,
              section3Notes: styleDoc.section3Notes,
              section4CustomerFeedback: styleDoc.section4CustomerFeedback,
              sizeData: styleDoc.sizeData,
              createdBy: userId,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            const savedProdDoc = await manager.save(
              ProductionDocument,
              productDoc,
            );

            // Clone size rows
            const sizeRows = await manager.find(ProductionDocumentSizeRow, {
              where: { productionDocumentId: styleDoc.id },
              order: { orderIndex: 'ASC' },
            });
            if (sizeRows.length > 0) {
              const clonedRows = sizeRows.map((row) =>
                manager.create(ProductionDocumentSizeRow, {
                  productionDocumentId: savedProdDoc.id,
                  sizeLabel: row.sizeLabel,
                  measurementName: row.measurementName,
                  measurementValue: row.measurementValue,
                  tolerance: row.tolerance,
                  orderIndex: row.orderIndex,
                }),
              );
              await manager.save(ProductionDocumentSizeRow, clonedRows);
            }

            // Clone sections
            const sections = await manager.find(ProductionDocumentSection, {
              where: { productionDocumentId: styleDoc.id },
              order: { orderIndex: 'ASC' },
            });
            if (sections.length > 0) {
              const clonedSections = sections.map((sec) =>
                manager.create(ProductionDocumentSection, {
                  productionDocumentId: savedProdDoc.id,
                  sectionCode: sec.sectionCode,
                  title: sec.title,
                  content: sec.content,
                  imageGroups: sec.imageGroups,
                  orderIndex: sec.orderIndex,
                  isFixed: sec.isFixed,
                }),
              );
              await manager.save(ProductionDocumentSection, clonedSections);
            }
          }
        }

        // 2.4. Clone Tài liệu đính kèm (StyleDocument -> PurchaseOrderProductDocument)
        if (opts.copyDocuments !== false) {
          const styleDocs = await manager.find(StyleDocument, {
            where: { styleId: sourceStyleId },
          });
          const docsToCopy = opts.selectedDocumentIds?.length
            ? styleDocs.filter((d) =>
                opts.selectedDocumentIds?.includes(d.documentId),
              )
            : styleDocs;

          if (docsToCopy.length > 0) {
            const productDocs = docsToCopy.map((doc) =>
              manager.create(PurchaseOrderProductDocument, {
                productId: savedProduct.id,
                documentId: doc.documentId,
                sourcePoDocument: false,
                purpose: doc.purpose,
                linkedBy: userId,
                linkedAt: new Date(),
              }),
            );
            await manager.save(PurchaseOrderProductDocument, productDocs);
          }
        }
      }

      // 2.5. Gán các tài liệu từ kho PO (nếu người dùng chọn gán ngay khi tạo)
      const poDocIds = dto.poDocumentIds || (dto as any).mappedFiles || [];
      if (poDocIds.length > 0) {
        const poDocs = await manager.find(PurchaseOrderDocument, {
          where: { purchaseOrderId: poId, documentId: In(poDocIds) },
        });
        const poDocMap = new Map(
          poDocs.map((pd) => [pd.documentId, pd.purpose]),
        );

        const lineDocs = poDocIds.map((docId: string) => {
          const entity = new PurchaseOrderProductDocument();
          entity.productId = savedProduct.id;
          entity.documentId = docId;
          entity.sourcePoDocument = true;
          entity.purpose = (poDocMap.get(docId) ||
            DocumentPurpose.OTHER) as any;
          entity.linkedBy = userId || (null as any);
          entity.linkedAt = new Date();
          return entity;
        });
        await manager.save(PurchaseOrderProductDocument, lineDocs);
      }

      // 2.6. Lưu màu sắc và bảng phân bổ size breakdown (nếu có)
      if (dto.colors && Array.isArray(dto.colors) && dto.colors.length > 0) {
        for (let cIdx = 0; cIdx < dto.colors.length; cIdx++) {
          const cDto = dto.colors[cIdx];
          const colorName = (cDto.colorName || '').trim();
          if (!colorName) continue;

          const colorEntity = manager.create(PurchaseOrderProductColor, {
            productId: savedProduct.id,
            colorName,
            colorCode: cDto.colorCode || undefined,
            orderIndex: cIdx,
          });
          const savedColor = await manager.save(
            PurchaseOrderProductColor,
            colorEntity,
          );

          if (
            cDto.sizes &&
            Array.isArray(cDto.sizes) &&
            cDto.sizes.length > 0
          ) {
            const sizeEntities = cDto.sizes
              .map((sDto, sIdx) =>
                manager.create(PurchaseOrderProductColorSize, {
                  productColorId: savedColor.id,
                  sizeLabel: (sDto.sizeLabel || '').trim(),
                  quantity: Number(sDto.quantity) || 0,
                  orderIndex: sIdx,
                }),
              )
              .filter((s) => !!s.sizeLabel);

            if (sizeEntities.length > 0) {
              await manager.save(PurchaseOrderProductColorSize, sizeEntities);
            }
          }
        }
      }

      // 3. Ghi log lịch sử khởi tạo
      const historyLog = new PurchaseOrderProductStatusHistory();
      historyLog.productId = savedProduct.id;
      historyLog.oldStatus = undefined as any;
      historyLog.newStatus = ProductStatus.DRAFT;
      historyLog.action = sourceStyleId ? 'imported_from_fit' : 'created';
      historyLog.reason = sourceStyleId
        ? `Import độc lập từ Mẫu Fit ${sourceStyle?.styleCode || ''} - ${sourceStyle?.styleName || ''}`
        : 'Tạo mới sản phẩm thủ công';
      historyLog.changedBy = userId || (null as any);
      historyLog.changedAt = new Date();
      await manager.save(PurchaseOrderProductStatusHistory, historyLog);

      return savedProduct;
    });
  }

  /**
   * Cập nhật thông tin sản phẩm (Độc lập, không thay đổi Style nguồn)
   */
  async updateProduct(
    poId: string,
    productId: string,
    dto: UpdatePoProductDto,
    userId?: string,
  ): Promise<PurchaseOrderProduct> {
    const product = await this.productRepo.findOne({
      where: { id: productId, purchaseOrderId: poId },
    });
    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm #${productId}`);
    }

    if (product.status === ProductStatus.CLOSED) {
      throw new BadRequestException(
        'Sản phẩm đang ở trạng thái Khóa. Vui lòng mở khóa trước khi chỉnh sửa.',
      );
    }

    if (dto.productCode && dto.productCode.trim() !== product.productCode) {
      const newCode = dto.productCode.trim();
      const duplicate = await this.productRepo.findOne({
        where: { purchaseOrderId: poId, productCode: newCode },
      });
      if (duplicate && duplicate.id !== productId) {
        throw new ConflictException(
          `Mã sản phẩm "${newCode}" đã tồn tại trong đơn hàng PO này`,
        );
      }
      product.productCode = newCode;
    }

    if (dto.productName) product.productName = dto.productName.trim();
    if (dto.category !== undefined)
      product.category = dto.category?.trim() || '';
    if (dto.materialNote !== undefined)
      product.materialNote =
        dto.materialNote?.trim() || dto.colorName?.trim() || '';
    if (dto.deadline !== undefined)
      product.deadline = dto.deadline ? new Date(dto.deadline) : (null as any);
    if (dto.as3bCmBaseDays !== undefined)
      product.as3bCmBaseDays = Number(dto.as3bCmBaseDays);
    if (dto.structureImageVersionId !== undefined)
      product.structureImageVersionId =
        dto.structureImageVersionId?.trim() || null;

    product.updatedBy = userId || product.updatedBy;
    product.updatedAt = new Date();

    const saved = await this.productRepo.save(product);

    // Cập nhật lại màu sắc và bảng phân bổ size nếu được truyền lên
    if (dto.colors !== undefined) {
      await this.dataSource.transaction(async (manager) => {
        const existingColors = await manager.find(PurchaseOrderProductColor, {
          where: { productId },
        });
        const existingColorIds = existingColors.map((c) => c.id);

        if (existingColorIds.length > 0) {
          await manager.delete(PurchaseOrderProductColorSize, {
            productColorId: In(existingColorIds),
          });
          await manager.delete(PurchaseOrderProductColor, {
            productId,
          });
        }

        if (Array.isArray(dto.colors) && dto.colors.length > 0) {
          for (let cIdx = 0; cIdx < dto.colors.length; cIdx++) {
            const cDto = dto.colors[cIdx];
            const colorName = (cDto.colorName || '').trim();
            if (!colorName) continue;

            const newColor = manager.create(PurchaseOrderProductColor, {
              productId,
              colorName,
              colorCode: cDto.colorCode || undefined,
              orderIndex: cIdx,
            });
            const savedColor = await manager.save(
              PurchaseOrderProductColor,
              newColor,
            );

            if (
              cDto.sizes &&
              Array.isArray(cDto.sizes) &&
              cDto.sizes.length > 0
            ) {
              const sizeEntities = cDto.sizes
                .map((sDto, sIdx) =>
                  manager.create(PurchaseOrderProductColorSize, {
                    productColorId: savedColor.id,
                    sizeLabel: (sDto.sizeLabel || '').trim(),
                    quantity: Number(sDto.quantity) || 0,
                    orderIndex: sIdx,
                  }),
                )
                .filter((s) => !!s.sizeLabel);

              if (sizeEntities.length > 0) {
                await manager.save(PurchaseOrderProductColorSize, sizeEntities);
              }
            }
          }
        }
      });
    }

    // Ghi log cập nhật nếu có lý do
    if (dto.reason) {
      const log = this.productHistoryRepo.create({
        productId,
        oldStatus: product.status,
        newStatus: product.status,
        action: 'updated',
        reason: dto.reason,
        changedBy: userId,
        changedAt: new Date(),
      });
      await this.productHistoryRepo.save(log);
    }

    return saved;
  }

  /**
   * Xóa sản phẩm khỏi PO (Độc lập, giữ nguyên Style nguồn)
   */
  async removeProduct(poId: string, productId: string): Promise<void> {
    const product = await this.productRepo.findOne({
      where: { id: productId, purchaseOrderId: poId },
    });
    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm #${productId}`);
    }

    if (product.status === ProductStatus.CLOSED) {
      throw new BadRequestException(
        'Sản phẩm đang ở trạng thái Khóa. Vui lòng mở khóa trước khi xóa.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      // 1. Xóa công đoạn con
      await manager.delete(PurchaseOrderProductOperationStep, { productId });

      // 2. Xóa các đợt mẫu & ảnh mẫu con
      const rounds = await manager.find(PurchaseOrderProductSampleRound, {
        where: { productId },
      });
      const roundIds = rounds.map((r) => r.id);
      if (roundIds.length > 0) {
        await manager.delete(PurchaseOrderProductSampleImage, {
          sampleRoundId: In(roundIds),
        });
        await manager.delete(PurchaseOrderProductSampleRound, { productId });
      }

      // 3. Xóa tài liệu SX tiếng Việt con
      const prodDocs = await manager.find(ProductionDocument, {
        where: { productId },
      });
      const prodDocIds = prodDocs.map((d) => d.id);
      if (prodDocIds.length > 0) {
        await manager.delete(ProductionDocumentSizeRow, {
          productionDocumentId: In(prodDocIds),
        });
        await manager.delete(ProductionDocumentSection, {
          productionDocumentId: In(prodDocIds),
        });
        await manager.delete(ProductionDocument, { productId });
      }

      // 4. Xóa tài liệu đính kèm Product
      await manager.delete(PurchaseOrderProductDocument, { productId });

      // 5. Xóa lịch sử trạng thái
      await manager.delete(PurchaseOrderProductStatusHistory, { productId });

      // 5.5. Xóa màu sắc & sizes của Product
      const colorsToDelete = await manager.find(PurchaseOrderProductColor, {
        where: { productId },
      });
      const colorIdsToDelete = colorsToDelete.map((c) => c.id);
      if (colorIdsToDelete.length > 0) {
        await manager.delete(PurchaseOrderProductColorSize, {
          productColorId: In(colorIdsToDelete),
        });
        await manager.delete(PurchaseOrderProductColor, { productId });
      }

      // 6. Xóa Product
      await manager.delete(PurchaseOrderProduct, { id: productId });
    });
  }

  /**
   * Gán tài liệu từ PO tổng vào Product (hỗ trợ kéo thả Drag & Drop)
   */
  async linkProductDocument(
    poId: string,
    productId: string,
    documentId: string,
    userId?: string,
    targetPurpose?: DocumentPurpose,
  ) {
    const poDoc = await this.poDocRepo.findOne({
      where: { purchaseOrderId: poId, documentId },
    });
    if (!poDoc) {
      throw new BadRequestException(
        `Tài liệu #${documentId} không thuộc đơn hàng PO #${poId}`,
      );
    }

    const purposeToUse =
      targetPurpose || poDoc.purpose || DocumentPurpose.OTHER;

    const existing = await this.productDocRepo.findOne({
      where: { productId, documentId },
    });
    if (existing) {
      if (targetPurpose && existing.purpose !== targetPurpose) {
        existing.purpose = targetPurpose;
        return await this.productDocRepo.save(existing);
      }
      return existing;
    }

    const link = this.productDocRepo.create({
      productId,
      documentId,
      sourcePoDocument: true,
      purpose: purposeToUse,
      linkedBy: userId,
      linkedAt: new Date(),
    });
    return await this.productDocRepo.save(link);
  }

  /**
   * Cập nhật mục đích sử dụng (Mục: PO Chi Tiết, TechPack, Khác) của tài liệu sản phẩm
   */
  async updateProductDocumentPurpose(
    poId: string,
    productId: string,
    documentId: string,
    purpose: DocumentPurpose,
  ) {
    const existing = await this.productDocRepo.findOne({
      where: { productId, documentId },
    });
    if (!existing) {
      throw new NotFoundException('Tài liệu chưa được gán vào sản phẩm này.');
    }
    existing.purpose = purpose;
    return await this.productDocRepo.save(existing);
  }

  /**
   * Gỡ liên kết tài liệu khỏi Product
   */
  async unlinkProductDocument(
    poId: string,
    productId: string,
    documentId: string,
  ): Promise<void> {
    await this.productDocRepo.delete({ productId, documentId });
  }

  /**
   * Tải lên tài liệu đính kèm trực tiếp cho Sản phẩm PO
   */
  async uploadProductDocument(
    poId: string,
    productId: string,
    file: any,
    purpose: string = 'other',
    userId?: string,
  ) {
    const product = await this.productRepo.findOne({
      where: { id: productId, purchaseOrderId: poId },
    });
    if (!product) {
      throw new NotFoundException(
        `Không tìm thấy sản phẩm #${productId} trong đơn hàng PO`,
      );
    }
    if (product.status === ProductStatus.CLOSED) {
      throw new BadRequestException(
        'Sản phẩm đã bị khóa, không thể tải lên tài liệu mới.',
      );
    }

    const validPurposes = Object.values(DocumentPurpose);
    const targetPurpose = (purpose || DocumentPurpose.OTHER) as DocumentPurpose;
    if (!validPurposes.includes(targetPurpose)) {
      throw new BadRequestException(
        `Mục đích sử dụng tài liệu không hợp lệ. Các giá trị hợp lệ: ${validPurposes.join(', ')}`,
      );
    }

    const ext = path.extname(file.originalname) || '';
    this.validateFileMagicBytes(ext, file.buffer);

    const uploadDir = path.join(process.cwd(), 'uploads', 'po-documents');
    if (!fs.existsSync(uploadDir)) {
      await fsPromises.mkdir(uploadDir, { recursive: true });
    }

    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(uploadDir, filename);

    if (file.buffer) {
      await fsPromises.writeFile(filePath, file.buffer);
    }

    const storageKey = `/uploads/po-documents/${filename}`;
    const now = new Date();

    try {
      const doc = this.docRepo.create({
        documentCode: `DOC-PROD-${Date.now().toString().slice(-6)}`,
        title: file.originalname,
        createdBy: userId || (null as any),
        createdAt: now,
      });
      const savedDoc = (await this.docRepo.save(doc)) as unknown as Document;

      const version = this.docVersionRepo.create({
        documentId: savedDoc.id,
        versionNo: 1,
        originalFileName: file.originalname,
        storageKey,
        mimeType: file.mimetype || 'application/octet-stream',
        byteSize: file.size || 0,
        status: UploadStatus.READY,
        uploadedBy: userId || (null as any),
        uploadedAt: now,
      });
      const savedVersion = (await this.docVersionRepo.save(
        version,
      )) as unknown as DocumentVersion;

      savedDoc.currentVersionId = savedVersion.id;
      await this.docRepo.save(savedDoc);

      // Lưu liên kết kho PO
      const poDoc = this.poDocRepo.create({
        purchaseOrderId: poId,
        documentId: savedDoc.id,
        purpose: targetPurpose,
        linkedBy: userId || (null as any),
        linkedAt: now,
      });
      await this.poDocRepo.save(poDoc);

      // Lưu liên kết sản phẩm
      const productDoc = this.productDocRepo.create({
        productId,
        documentId: savedDoc.id,
        sourcePoDocument: false,
        purpose: targetPurpose,
        linkedBy: userId,
        linkedAt: now,
      });
      await this.productDocRepo.save(productDoc);

      return {
        productId,
        documentId: savedDoc.id,
        documentCode: savedDoc.documentCode,
        title: savedDoc.title,
        purpose: String(targetPurpose),
        sourcePoDocument: false,
        linkedAt: now,
        fileName: file.originalname,
        fileUrl: storageKey,
        fileSize: file.size,
        currentVersionNo: 1,
        versions: [
          {
            id: savedVersion.id,
            versionNo: 1,
            originalFileName: file.originalname,
            fileUrl: storageKey,
            fileSize: file.size,
            mimeType: file.mimetype,
            changeReason: null,
            uploadedAt: now,
            uploadedBy: userId,
          },
        ],
      };
    } catch (error) {
      if (fs.existsSync(filePath)) {
        await fsPromises.unlink(filePath).catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Cập nhật phiên bản mới cho tài liệu của sản phẩm
   */
  async uploadDocumentVersion(
    poId: string,
    productId: string,
    documentId: string,
    file: any,
    changeReason?: string,
    userId?: string,
  ) {
    if (!changeReason || !changeReason.trim()) {
      throw new BadRequestException(
        'Vui lòng nhập lý do / ghi chú thay đổi phiên bản từ khách hàng.',
      );
    }

    const product = await this.productRepo.findOne({
      where: { id: productId, purchaseOrderId: poId },
    });
    if (!product) {
      throw new NotFoundException(
        `Không tìm thấy sản phẩm #${productId} trong đơn hàng PO`,
      );
    }
    if (product.status === ProductStatus.CLOSED) {
      throw new BadRequestException(
        'Sản phẩm đã bị khóa, không thể cập nhật phiên bản mới.',
      );
    }

    const prodDoc = await this.productDocRepo.findOne({
      where: { productId, documentId },
    });
    if (!prodDoc) {
      throw new NotFoundException('Tài liệu không thuộc sản phẩm này.');
    }

    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) {
      throw new NotFoundException('Không tìm thấy tài liệu.');
    }

    const existingVersions = await this.docVersionRepo.find({
      where: { documentId },
      order: { versionNo: 'DESC' },
    });
    const maxVersion =
      existingVersions.length > 0
        ? Math.max(...existingVersions.map((v) => v.versionNo))
        : 0;
    const nextVersionNo = maxVersion + 1;

    const ext = path.extname(file.originalname) || '';
    this.validateFileMagicBytes(ext, file.buffer);

    const uploadDir = path.join(process.cwd(), 'uploads', 'po-documents');
    if (!fs.existsSync(uploadDir)) {
      await fsPromises.mkdir(uploadDir, { recursive: true });
    }

    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(uploadDir, filename);

    if (file.buffer) {
      await fsPromises.writeFile(filePath, file.buffer);
    }

    const storageKey = `/uploads/po-documents/${filename}`;
    const now = new Date();

    try {
      const newVersion = this.docVersionRepo.create({
        documentId,
        versionNo: nextVersionNo,
        originalFileName: file.originalname,
        storageKey,
        mimeType: file.mimetype || 'application/octet-stream',
        byteSize: file.size || 0,
        status: UploadStatus.READY,
        changeReason: changeReason?.trim() || undefined,
        uploadedBy: userId || (null as any),
        uploadedAt: now,
      });
      const savedVersion = (await this.docVersionRepo.save(
        newVersion,
      )) as unknown as DocumentVersion;

      doc.currentVersionId = savedVersion.id;
      await this.docRepo.save(doc);

      const allVersions = [savedVersion, ...existingVersions];

      return {
        productId,
        documentId: doc.id,
        documentCode: doc.documentCode,
        title: doc.title,
        purpose: String(prodDoc.purpose),
        sourcePoDocument: prodDoc.sourcePoDocument,
        linkedAt: prodDoc.linkedAt,
        fileName: file.originalname,
        fileUrl: storageKey,
        fileSize: file.size,
        currentVersionNo: nextVersionNo,
        changeReason: savedVersion.changeReason,
        versions: allVersions.map((v) => ({
          id: v.id,
          versionNo: v.versionNo,
          originalFileName: v.originalFileName,
          fileUrl: v.storageKey,
          fileSize: v.byteSize ? Number(v.byteSize) : null,
          mimeType: v.mimeType,
          changeReason: v.changeReason,
          uploadedAt: v.uploadedAt,
          uploadedBy: v.uploadedBy,
        })),
      };
    } catch (error) {
      if (fs.existsSync(filePath)) {
        await fsPromises.unlink(filePath).catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Quản lý bảng công đoạn riêng của Product
   */
  async getProductOperationSteps(productId: string) {
    return this.productStepRepo.find({
      where: { productId },
      order: { orderIndex: 'ASC' },
    });
  }

  async saveProductOperationSteps(
    productId: string,
    dto: SaveProductOperationStepsDto,
    userId?: string,
  ) {
    const product = await this.productRepo.findOne({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm #${productId}`);
    }

    if (product.status === ProductStatus.CLOSED) {
      throw new BadRequestException(
        'Sản phẩm đang ở trạng thái Khóa. Không thể chỉnh sửa bảng quy trình công đoạn.',
      );
    }

    return await this.dataSource.transaction(async (manager) => {
      // Xóa các bước cũ
      await manager.delete(PurchaseOrderProductOperationStep, { productId });

      // Tạo các bước mới
      const newSteps = (dto.steps || []).map((step, idx) => {
        const entity = new PurchaseOrderProductOperationStep();
        entity.id = step.id || randomUUID();
        entity.productId = productId;
        entity.parentStepId = (step.parentStepId || null) as any;
        entity.stageId = (step.stageId || null) as any;
        entity.stepName = step.stepName;
        entity.description = (step.description || null) as any;
        entity.timePerPiece = Number(step.timePerPiece || 0);
        entity.ssv = Number(step.ssv || 0);
        entity.targetTotal = Number(step.targetTotal || 0);
        entity.note = (step.note || null) as any;
        entity.orderIndex = step.orderIndex ?? idx;
        entity.isGroup = Boolean(step.isGroup);
        return entity;
      });

      const savedSteps = await manager.save(
        PurchaseOrderProductOperationStep,
        newSteps,
      );

      if (dto.cmBaseDays) {
        product.as3bCmBaseDays = Number(dto.cmBaseDays);
        await manager.save(PurchaseOrderProduct, product);
      }

      // Log lịch sử
      const log = new PurchaseOrderProductStatusHistory();
      log.productId = productId;
      log.oldStatus = product.status;
      log.newStatus = product.status;
      log.action = 'operation_steps_updated';
      log.reason =
        dto.reason || `Cập nhật ${savedSteps.length} bước công đoạn sản xuất`;
      log.changedBy = userId || (null as any);
      log.changedAt = new Date();
      await manager.save(PurchaseOrderProductStatusHistory, log);

      return savedSteps;
    });
  }

  /**
   * Quản lý đợt mẫu riêng của Product
   */
  async getProductSampleRounds(productId: string) {
    const rounds = await this.productSampleRoundRepo.find({
      where: { productId },
      order: { roundNo: 'ASC' },
    });

    const roundIds = rounds.map((r) => r.id);
    const imagesMap: Map<string, PurchaseOrderProductSampleImage[]> = new Map();
    if (roundIds.length > 0) {
      const images = await this.productSampleImageRepo.find({
        where: { sampleRoundId: In(roundIds) },
        order: { orderIndex: 'ASC' },
      });
      for (const img of images) {
        const list = imagesMap.get(img.sampleRoundId) || [];
        list.push(img);
        imagesMap.set(img.sampleRoundId, list);
      }
    }

    return rounds.map((r) => ({
      ...r,
      images: imagesMap.get(r.id) || [],
    }));
  }

  async createProductSampleRound(
    productId: string,
    dto: CreateProductSampleRoundDto,
    userId?: string,
  ) {
    const product = await this.productRepo.findOne({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm #${productId}`);
    }

    const currentCount = await this.productSampleRoundRepo.count({
      where: { productId },
    });
    const roundNo = dto.roundNo || currentCount + 1;

    const round = this.productSampleRoundRepo.create({
      productId,
      roundNo,
      sampleDate: dto.sampleDate ? new Date(dto.sampleDate) : new Date(),
      feedback: dto.feedback || '',
      status: (dto.status as SampleStatus) || SampleStatus.WORKING,
      createdBy: userId,
      createdAt: new Date(),
    });

    return await this.productSampleRoundRepo.save(round);
  }

  /**
   * Quản lý tài liệu sản xuất tiếng Việt riêng của Product
   */
  async getProductProductionDoc(productId: string) {
    const doc = await this.prodDocRepo.findOne({
      where: { productId },
    });
    if (!doc) return null;

    const [sections, sizeRows] = await Promise.all([
      this.prodDocSectionRepo.find({
        where: { productionDocumentId: doc.id },
        order: { orderIndex: 'ASC' },
      }),
      this.prodDocSizeRowRepo.find({
        where: { productionDocumentId: doc.id },
        order: { orderIndex: 'ASC' },
      }),
    ]);

    return {
      ...doc,
      sections,
      sizeRows,
    };
  }

  async updateProductProductionDoc(
    productId: string,
    dto: any,
    userId?: string,
  ) {
    let doc = await this.prodDocRepo.findOne({ where: { productId } });

    if (!doc) {
      const product = await this.productRepo.findOne({
        where: { id: productId },
      });
      doc = this.prodDocRepo.create({
        productId,
        styleId: null,
        name: dto.name || `Tài liệu SX - ${product?.productCode || 'SP'}`,
        status: dto.status || ProductionDocStatus.DRAFT,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      doc = await this.prodDocRepo.save(doc);
    }

    if (dto.name !== undefined) doc.name = dto.name.trim();
    if (dto.description !== undefined)
      doc.description = dto.description ? dto.description.trim() : null;
    if (dto.status !== undefined) doc.status = dto.status;
    if (dto.section1Description !== undefined)
      doc.section1Description = dto.section1Description;
    if (dto.section1ImageUrl !== undefined)
      doc.section1ImageUrl = dto.section1ImageUrl;
    if (dto.section2Accessories !== undefined)
      doc.section2Accessories = dto.section2Accessories;
    if (dto.section3Notes !== undefined) doc.section3Notes = dto.section3Notes;
    if (dto.section4CustomerFeedback !== undefined)
      doc.section4CustomerFeedback = dto.section4CustomerFeedback;
    if (dto.sizeData !== undefined) doc.sizeData = dto.sizeData;

    doc.updatedBy = userId || (null as any);
    doc.updatedAt = new Date();

    await this.prodDocRepo.save(doc);

    // Lưu sections (dynamic sections 06+)
    if (dto.sections !== undefined) {
      const existingSections = await this.prodDocSectionRepo.find({
        where: { productionDocumentId: doc.id },
      });
      const nonFixed = existingSections.filter((s) => !s.isFixed);
      if (nonFixed.length > 0) {
        await this.prodDocSectionRepo.remove(nonFixed);
      }

      let dynamicOrder = 5;
      const newSections = (dto.sections || [])
        .filter((s: any) => !s.isFixed)
        .map((s: any) =>
          this.prodDocSectionRepo.create({
            productionDocumentId: doc.id,
            sectionCode: s.sectionCode || `SEC_DYN_${dynamicOrder++}`,
            title: s.title ? s.title.trim() : '',
            content: s.content ? s.content.trim() : null,
            imageGroups: s.imageGroups ?? [],
            orderIndex: s.orderIndex ?? dynamicOrder,
            isFixed: false,
          }),
        );
      if (newSections.length > 0) {
        await this.prodDocSectionRepo.save(newSections);
      }
    }

    // Lưu sizeRows (bảng thông số kích thước)
    if (dto.sizeRows !== undefined) {
      const existingSizeRows = await this.prodDocSizeRowRepo.find({
        where: { productionDocumentId: doc.id },
      });
      if (existingSizeRows.length > 0) {
        await this.prodDocSizeRowRepo.remove(existingSizeRows);
      }

      if (dto.sizeRows.length > 0) {
        const newSizeRows = dto.sizeRows.map((sr: any, index: number) =>
          this.prodDocSizeRowRepo.create({
            productionDocumentId: doc.id,
            sizeLabel: String(sr.sizeLabel || '').trim(),
            measurementName: String(sr.measurementName || '').trim(),
            measurementValue: sr.measurementValue
              ? String(sr.measurementValue).trim()
              : null,
            tolerance: sr.tolerance ? String(sr.tolerance).trim() : null,
            orderIndex: sr.orderIndex ?? index + 1,
          }),
        );
        await this.prodDocSizeRowRepo.save(newSizeRows);
      }
    }

    return this.getProductProductionDoc(productId);
  }

  /**
   * Chuyển trạng thái sản phẩm
   */
  async updateProductStatus(
    poId: string,
    productId: string,
    status: ProductStatus,
    reason?: string,
    userId?: string,
  ) {
    const product = await this.productRepo.findOne({
      where: { id: productId, purchaseOrderId: poId },
    });
    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm #${productId}`);
    }

    // Đối với Product chỉ có 2 trạng thái: Đang Xử Lý (DRAFT) và Khóa (CLOSED)
    const normalizedStatus =
      status === ProductStatus.CLOSED
        ? ProductStatus.CLOSED
        : ProductStatus.DRAFT;

    const oldStatus = product.status;
    product.previousStatus = oldStatus;
    product.status = normalizedStatus;
    if (userId) product.updatedBy = userId;
    product.updatedAt = new Date();

    const saved = await this.productRepo.save(product);

    const log = new PurchaseOrderProductStatusHistory();
    log.productId = productId;
    log.oldStatus = oldStatus;
    log.newStatus = normalizedStatus;
    log.action =
      normalizedStatus === ProductStatus.CLOSED ? 'locked' : 'unlocked';
    log.reason =
      reason ||
      (normalizedStatus === ProductStatus.CLOSED
        ? 'Khóa sản phẩm'
        : 'Mở khóa sản phẩm (Đang xử lý)');
    log.changedBy = userId || (null as any);
    log.changedAt = new Date();
    await this.productHistoryRepo.save(log);

    return saved;
  }
}
