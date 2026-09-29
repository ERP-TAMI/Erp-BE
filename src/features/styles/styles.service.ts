import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Style } from './entities/Style.entity';
import { StyleDocument } from './entities/StyleDocument.entity';
import { DraftBomFamilie } from '../draft-boms/entities/DraftBomFamilie.entity';
import { StyleStatus } from '../../common/enums/database.enums';
import { CreateStyleDto, UpdateStyleDto, StyleQueryDto } from './dto';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import {
  isResolvableObjectKey,
  isObjectKeyInScope,
} from '../storage/storage-key.util';
import { DEFAULT_MAX_UPLOAD_SIZE_BYTES } from '../../common/utils/file-validation';

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class StylesService {
  constructor(
    @InjectRepository(Style)
    private readonly styleRepository: Repository<Style>,
    @InjectRepository(DraftBomFamilie)
    private readonly draftBomFamilyRepository: Repository<DraftBomFamilie>,
    @InjectRepository(StyleDocument)
    private readonly styleDocumentRepository: Repository<StyleDocument>,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
    private readonly dataSource: DataSource,
  ) {}

  // baseImageKey stores an S3 object key, never a URL — a presigned URL
  // expires (PRESIGN_GET_EXPIRY_SECONDS). Service methods that read/write the
  // entity (e.g. update()) always work with the raw key; callers building an
  // API response must resolve it fresh via this method right before sending.
  async withResolvedBaseImage(style: Style): Promise<Style> {
    if (!style.baseImageKey) return style;
    // Dữ liệu cũ còn giữ đường dẫn ổ đĩa ("/uploads/style-images/..."). Ký URL
    // cho nó chỉ tạo ra link trỏ vào key không tồn tại trên S3 (và có cả dấu
    // gạch đôi), nên trả null để client hiển thị ảnh mặc định.
    if (!isResolvableObjectKey(style.baseImageKey)) {
      return { ...style, baseImageKey: null };
    }
    const baseImageKey = await this.storage.getPresignedGetUrl(
      style.baseImageKey,
    );
    return { ...style, baseImageKey };
  }

  // A client-supplied baseImageKey must be one this style's own presign
  // request produced (styles/${id}/documents/...) — otherwise any user could
  // point a style at another resource's object (cross-resource hijack) and
  // read it back via withResolvedBaseImage(). Mirrors the isObjectKeyInScope
  // check style-documents/style-sample-rounds already do at confirm().
  private async validateAndResolveBaseImageKey(
    objectKey: string | null,
    styleId: string,
  ): Promise<string | null> {
    if (!objectKey) return null;

    if (!isObjectKeyInScope(objectKey, `styles/${styleId}/`)) {
      throw new BadRequestException(
        'baseImageKey không hợp lệ cho mẫu Fit này',
      );
    }

    const head = await this.storage.headObject(objectKey);
    if (!head.exists) {
      throw new BadRequestException(
        'Không tìm thấy ảnh đã tải lên, vui lòng thử tải lại',
      );
    }
    if (head.sizeBytes && head.sizeBytes > DEFAULT_MAX_UPLOAD_SIZE_BYTES) {
      await this.storage.deleteObject(objectKey);
      throw new BadRequestException(
        `Dung lượng ảnh vượt quá giới hạn ${(DEFAULT_MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB`,
      );
    }

    return objectKey;
  }

  async create(dto: CreateStyleDto, userId?: string): Promise<Style> {
    const styleCodeClean = dto.styleCode?.trim();
    if (!styleCodeClean) {
      throw new BadRequestException('Mã mẫu Fit không được để trống');
    }

    const styleNameClean = dto.styleName?.trim();
    if (!styleNameClean) {
      throw new BadRequestException('Tên mẫu Fit không được để trống');
    }

    const existing = await this.styleRepository.findOne({
      where: { styleCode: styleCodeClean },
    });

    if (existing) {
      throw new ConflictException(
        `Mã mẫu Fit "${styleCodeClean}" đã tồn tại trong hệ thống`,
      );
    }

    const style = this.styleRepository.create({
      styleCode: styleCodeClean,
      styleName: styleNameClean,
      description: dto.description?.trim() ?? null,
      category: dto.category?.trim() ?? null,
      // baseImageKey can only be attached via update(), once the style has
      // an id to scope the object key to — see validateAndResolveBaseImageKey.
      baseImageKey: null,
      status: dto.status ?? StyleStatus.DRAFT,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    });

    return this.styleRepository.save(style);
  }

  async findAll(query: StyleQueryDto): Promise<PaginatedResult<Style>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(100, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.styleRepository.createQueryBuilder('style');

    if (query.search?.trim()) {
      const searchPattern = `%${query.search.trim()}%`;
      qb.andWhere(
        '(style.style_code ILIKE :search OR style.style_name ILIKE :search)',
        { search: searchPattern },
      );
    }

    if (query.category?.trim()) {
      qb.andWhere('style.category = :category', {
        category: query.category.trim(),
      });
    }

    if (query.status) {
      qb.andWhere('style.status = :status', { status: query.status });
    }

    qb.orderBy('style.created_at', 'DESC').addOrderBy('style.id', 'DESC');

    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async findOne(id: string): Promise<Style> {
    const style = await this.styleRepository.findOne({ where: { id } });
    if (!style) {
      throw new NotFoundException(`Không tìm thấy mẫu Fit với ID: ${id}`);
    }
    return style;
  }

  async findByCode(styleCode: string): Promise<Style> {
    const style = await this.styleRepository.findOne({
      where: { styleCode: styleCode.trim() },
    });
    if (!style) {
      throw new NotFoundException(
        `Không tìm thấy mẫu Fit với mã: ${styleCode}`,
      );
    }
    return style;
  }

  async update(
    id: string,
    dto: UpdateStyleDto,
    userId?: string,
  ): Promise<Style> {
    const style = await this.findOne(id);

    if (dto.styleCode !== undefined) {
      const codeClean = dto.styleCode.trim();
      if (!codeClean) {
        throw new BadRequestException('Mã mẫu Fit không được để trống');
      }
      if (codeClean !== style.styleCode) {
        const existing = await this.styleRepository.findOne({
          where: { styleCode: codeClean },
        });
        if (existing && existing.id !== id) {
          throw new ConflictException(
            `Mã mẫu Fit "${codeClean}" đã tồn tại trong hệ thống`,
          );
        }
        style.styleCode = codeClean;
      }
    }

    if (dto.styleName !== undefined) {
      const styleNameClean = dto.styleName.trim();
      if (!styleNameClean) {
        throw new BadRequestException('Tên mẫu Fit không được để trống');
      }
      style.styleName = styleNameClean;
    }
    if (dto.description !== undefined) {
      style.description = dto.description?.trim() ?? null;
    }
    if (dto.category !== undefined) {
      style.category = dto.category?.trim() ?? null;
    }
    if (dto.baseImageKey !== undefined) {
      style.baseImageKey = await this.validateAndResolveBaseImageKey(
        dto.baseImageKey ?? null,
        id,
      );
    }
    if (dto.status !== undefined) {
      style.status = dto.status;
    }

    style.updatedBy = userId ?? null;
    style.rowVersion = Number(style.rowVersion) + 1;

    return this.styleRepository.save(style);
  }

  async remove(id: string): Promise<void> {
    const style = await this.findOne(id);

    const hasDraftBom = await this.draftBomFamilyRepository.exists({
      where: { styleId: id },
    });
    if (hasDraftBom) {
      throw new ConflictException(
        'Không thể xoá mẫu Fit vì đang có Fit BOM đang soạn thảo (draft) chưa duyệt.',
      );
    }

    // documents/document_versions bị dùng chung giữa nhiều module (style,
    // PO, PO product, thư mục nội bộ) qua các bảng junction riêng — style_id
    // cascade xoá style_documents, nhưng bản thân document/document_versions
    // (và object S3) không tự dọn theo trước đây, để rác vĩnh viễn không ai
    // dọn được qua app. Lấy danh sách document trước khi xoá style để biết
    // "ứng viên" nào cần kiểm tra mồ côi sau khi cascade chạy xong.
    const linkedDocuments = await this.styleDocumentRepository.find({
      where: { styleId: id },
    });
    const candidateDocumentIds = [
      ...new Set(linkedDocuments.map((d) => d.documentId)),
    ];

    let orphanedStorageKeys: string[] = [];

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.remove(Style, style);

        if (candidateDocumentIds.length === 0) return;

        // Một document có thể vẫn đang được dùng ở nơi khác (style khác, PO,
        // PO product, thư mục) — chỉ coi là mồ côi khi KHÔNG còn bất kỳ
        // tham chiếu nào ở tất cả các bảng junction biết tới documents.id.
        const stillReferencedRows: { document_id: string }[] =
          await manager.query(
            `SELECT document_id FROM style_documents WHERE document_id = ANY($1)
             UNION SELECT document_id FROM folder_documents WHERE document_id = ANY($1)
             UNION SELECT document_id FROM purchase_order_documents WHERE document_id = ANY($1)
             UNION SELECT document_id FROM purchase_order_product_documents WHERE document_id = ANY($1)
             UNION SELECT source_style_document_id AS document_id FROM purchase_order_product_documents WHERE source_style_document_id = ANY($1)`,
            [candidateDocumentIds],
          );
        const stillReferencedIds = new Set(
          stillReferencedRows.map((r) => r.document_id),
        );
        const orphanDocumentIds = candidateDocumentIds.filter(
          (docId) => !stillReferencedIds.has(docId),
        );
        if (orphanDocumentIds.length === 0) return;

        // Riêng từng version cũng có thể bị tham chiếu trực tiếp (ảnh sample,
        // color card...) độc lập với document cha — bỏ qua toàn bộ document
        // đó nếu bất kỳ version nào của nó còn bị dùng, an toàn hơn là xoá
        // một phần.
        const versionRows: {
          id: string;
          document_id: string;
          storage_key: string;
        }[] = await manager.query(
          `SELECT id, document_id, storage_key FROM document_versions WHERE document_id = ANY($1)`,
          [orphanDocumentIds],
        );
        if (versionRows.length === 0) return;

        const versionIds = versionRows.map((v) => v.id);
        const versionsStillReferencedRows: { document_version_id: string }[] =
          await manager.query(
            `SELECT document_version_id FROM product_color_card_versions WHERE document_version_id = ANY($1)
             UNION SELECT document_version_id FROM production_document_images WHERE document_version_id = ANY($1)
             UNION SELECT document_version_id FROM purchase_order_product_sample_images WHERE document_version_id = ANY($1)
             UNION SELECT document_version_id FROM style_sample_images WHERE document_version_id = ANY($1)`,
            [versionIds],
          );
        const referencedVersionIds = new Set(
          versionsStillReferencedRows.map((r) => r.document_version_id),
        );
        const documentIdsWithReferencedVersion = new Set(
          versionRows
            .filter((v) => referencedVersionIds.has(v.id))
            .map((v) => v.document_id),
        );

        const safeToDeleteDocumentIds = orphanDocumentIds.filter(
          (docId) => !documentIdsWithReferencedVersion.has(docId),
        );
        if (safeToDeleteDocumentIds.length === 0) return;

        orphanedStorageKeys = versionRows
          .filter((v) => safeToDeleteDocumentIds.includes(v.document_id))
          .map((v) => v.storage_key);

        // Bỏ con trỏ current_version_id trước để không đụng FK RESTRICT khi
        // xoá document_versions.
        await manager.query(
          `UPDATE documents SET current_version_id = NULL WHERE id = ANY($1)`,
          [safeToDeleteDocumentIds],
        );
        await manager.query(
          `DELETE FROM document_versions WHERE document_id = ANY($1)`,
          [safeToDeleteDocumentIds],
        );
        await manager.query(`DELETE FROM documents WHERE id = ANY($1)`, [
          safeToDeleteDocumentIds,
        ]);
      });
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Không thể xoá mẫu Fit vì đang được sử dụng bởi dữ liệu khác (BOM, tài liệu sản xuất...).',
        );
      }
      throw error;
    }

    // Dọn S3 sau khi transaction DB đã commit thành công — S3 không có giao
    // dịch nên làm best-effort ở đây; một object sót lại nếu bước này lỗi chỉ
    // là rác lưu trữ nhỏ, không phải lỗi toàn vẹn dữ liệu.
    for (const storageKey of orphanedStorageKeys) {
      try {
        await this.storage.deleteObject(storageKey);
      } catch {
        // best-effort cleanup — bỏ qua, không chặn kết quả xoá style
      }
    }
  }

  private isForeignKeyViolation(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === '23503'
    );
  }
}
