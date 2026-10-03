import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as ExcelJS from 'exceljs';
import * as JSZip from 'jszip';
import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource, EntityManager } from 'typeorm';
import { assertAllowedFile } from '../../common/utils/file-validation';
import {
  PRESIGN_GET_EXPIRY_SECONDS,
  PRESIGN_PUT_EXPIRY_SECONDS,
  STORAGE_SERVICE,
  StorageService,
} from '../storage/storage.interface';
import {
  isResolvableObjectKey,
  isObjectKeyInScope,
  isDuplicateStorageKeyError,
} from '../storage/storage-key.util';
import { PurchaseOrder } from './entities/PurchaseOrder.entity';
import { PurchaseOrderDocument } from './entities/PurchaseOrderDocument.entity';
import { PurchaseOrderProduct } from './entities/PurchaseOrderProduct.entity';
import {
  PurchaseOrderProductOperationStep,
  PurchaseOrderProductSampleRound,
  PurchaseOrderProductSampleImage,
  PurchaseOrderProductDocument,
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
import { UpdateStyleProductionDocDto } from '../production/dto/update-style-production-doc.dto';
import { Bom } from '../boms/entities/Bom.entity';
import { Document } from '../documents/entities/Document.entity';
import { DocumentVersion } from '../documents/entities/DocumentVersion.entity';
import { Customer } from '../master-data/entities/Customer.entity';
import {
  AuditEventType,
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
  QueryPoDocumentDto,
  QueryPoProductDto,
  UpdatePoStatusDto,
  LinkPoDocumentDto,
  CreatePoProductDto,
  UpdatePoProductDto,
  ProductColorItemDto,
  SaveProductOperationStepsDto,
  CreateProductSampleRoundDto,
  UpdateProductSampleRoundDto,
  PresignProductSampleImageDto,
  ConfirmProductSampleImageDto,
  PresignPoDocumentDto,
  ConfirmPoDocumentDto,
  ConfirmPoDocumentVersionDto,
} from './dto';
import { AuditService, EntityAuditInput } from '../audit/audit.service';
import { AuditActor } from '../audit/audit-actor.type';
import { diffEntity, EntityFieldChange } from '../audit/entity-diff.util';

export const ALLOWED_PO_MIME_BY_EXTENSION: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
    'application/x-zip-compressed',
  ],
  '.doc': ['application/msword'],
  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/octet-stream',
    'application/x-zip-compressed',
  ],
  '.xls': ['application/vnd.ms-excel'],
  '.csv': [
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/csv',
    'text/x-csv',
  ],
  '.txt': ['text/plain'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.webp': ['image/webp'],
  '.gif': ['image/gif'],
};

const PO_DOCUMENT_MAX_SIZE_BYTES = 25 * 1024 * 1024;

const SAMPLE_IMAGE_ALLOWLIST: Record<string, string[]> = {
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.webp': ['image/webp'],
  '.gif': ['image/gif'],
};
const MAX_SAMPLE_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/** Đủ cho mọi chữ ký magic (dài nhất 12 byte) và cho mẫu 4096 byte của tệp văn bản. */
const MAGIC_BYTES_SAMPLE_SIZE = 4096;

/** Các đuôi mà bộ kiểm tra quét toàn bộ nội dung, không chỉ phần đầu. */
const TEXT_EXTENSIONS_SCANNED_IN_FULL = new Set(['.txt', '.csv']);

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

/**
 * Thông tin chung của một đơn hàng PO.
 *
 * Cố ý KHÔNG kèm products / documents / statusHistory: mỗi tab ở màn chi tiết
 * tự gọi endpoint riêng của nó (`:id/products`, `:id/documents`, `:id/history`).
 * Trước đây gói tất cả vào một response khiến mỗi lần mở PO phải nạp cả sản
 * phẩm, tài liệu, lịch sử và presign S3 cho từng tài liệu — dù người dùng chỉ
 * xem thông tin chung. Hai trường *Count ở đây đủ để tab hiển thị con số mà
 * không phải tải danh sách.
 */
export interface PurchaseOrderDetailResponse {
  id: string;
  poCode: string;
  customerPoCode: string | null;
  customerId: string | null;
  customerNameSnapshot: string;
  receivedDate: Date;
  deadline: Date | null;
  note: string | null;
  status: PoStatus;
  cancellationReason: string | null;
  closedAt: Date | null;
  closedBy: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  productsCount: number;
  documentsCount: number;
}

/** Một tài liệu đã gắn vào PO, kèm link tải đã ký sẵn. */
export interface PoDocumentResponse {
  documentId: string;
  documentCode: string | null;
  title: string;
  purpose: string;
  linkedAt: Date;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  currentVersionNo?: number;
  versions?: Array<{
    id: string;
    versionNo: number;
    originalFileName: string;
    fileUrl: string | null;
    fileSize: number | null;
    changeReason: string | null;
    evidenceFileName: string | null;
    evidenceUrl: string | null;
    uploadedAt: Date;
    uploadedBy: string | null;
  }>;
}

function toYmdString(val: string | Date): string {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val).slice(0, 10);
}

function getVietnamBusinessDateYmd(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

const AUDIT_TYPE = {
  PO: 'PurchaseOrder',
  PO_DOCUMENT: 'PurchaseOrderDocument',
  PRODUCT: 'PurchaseOrderProduct',
  PRODUCT_STEPS: 'PurchaseOrderProductOperationStep',
  PRODUCT_SAMPLE_ROUND: 'PurchaseOrderProductSampleRound',
  PRODUCT_PRODUCTION_DOC: 'PurchaseOrderProductionDocument',
  PRODUCT_DOCUMENT: 'PurchaseOrderProductDocument',
} as const;

const PO_AUDIT_FIELDS = [
  'poCode',
  'customerPoCode',
  'customerNameSnapshot',
  'receivedDate',
  'deadline',
  'note',
  'status',
  'cancellationReason',
];
const PRODUCT_AUDIT_FIELDS = [
  'productCode',
  'productName',
  'category',
  'materialNote',
  'deadline',
  'as3bCmBaseDays',
  'structureImageVersionId',
  'status',
];
const SAMPLE_ROUND_AUDIT_FIELDS = ['sampleDate', 'feedback', 'status'];
const STEP_AUDIT_FIELDS = [
  'stepName',
  'description',
  'timePerPiece',
  'ssv',
  'targetTotal',
  'note',
  'orderIndex',
  'isGroup',
  'parentStepId',
];
const PRODUCTION_DOC_AUDIT_FIELDS = [
  'name',
  'description',
  'status',
  'section1Description',
  'section1ImageUrl',
  'section2Accessories',
  'section3Notes',
  'section4CustomerFeedback',
  'sizeData',
];
const AUDIT_DATE_FIELDS = new Set(['receivedDate', 'deadline', 'sampleDate']);
const AUDIT_NUMERIC_FIELDS = new Set([
  'timePerPiece',
  'ssv',
  'targetTotal',
  'orderIndex',
  'as3bCmBaseDays',
]);

type AuditSnapshot = Record<string, unknown>;

/** Cột date/numeric đọc từ DB về là chuỗi, còn giá trị vừa gán là Date/number —
 * so thẳng thì lần lưu nào cũng "đổi". Chuẩn hoá trước khi diff. */
function auditSnapshot(
  entity: object | null | undefined,
  fields: readonly string[],
): AuditSnapshot | null {
  if (!entity) return null;
  const source = entity as Record<string, unknown>;
  const snapshot: AuditSnapshot = {};
  for (const field of fields) {
    const value = source[field];
    if (value === null || value === undefined || value === '') {
      snapshot[field] = null;
    } else if (AUDIT_DATE_FIELDS.has(field)) {
      snapshot[field] = toYmdString(value as string | Date);
    } else if (AUDIT_NUMERIC_FIELDS.has(field)) {
      snapshot[field] = Number(value);
    } else {
      snapshot[field] = value;
    }
  }
  return snapshot;
}

function auditDiff(
  before: object | null,
  after: object,
  fields: readonly string[],
): EntityFieldChange[] {
  return diffEntity(
    auditSnapshot(before, fields),
    auditSnapshot(after, fields) as AuditSnapshot,
    fields,
  );
}

function productAuditLabel(product: PurchaseOrderProduct): string {
  return `${product.productCode} - ${product.productName}`;
}

function formatColorSizes(
  sizes: Array<{ sizeLabel: string; quantity: number | string }>,
): string {
  return sizes.length === 0
    ? '(không có size)'
    : sizes.map((s) => `${s.sizeLabel}: ${Number(s.quantity)}`).join(' · ');
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
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
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
    private readonly auditService: AuditService,
  ) {}

  private async recordAudit(
    manager: EntityManager,
    actor: AuditActor | undefined,
    input: Omit<EntityAuditInput, 'actorId' | 'actorRole'>,
  ): Promise<void> {
    if (!actor) return;
    await this.auditService.recordEntityChange(manager, {
      ...input,
      actorId: actor.id,
      actorRole: actor.roleCode,
    });
  }

  /** Giống normalizeImageRef bên Mẫu Fit: FE gửi lại nguyên link đã ký nhận
   * được lúc đọc, nên phải rút về object key trước khi vào DB hoặc lịch sử —
   * link đó chứa access key và hết hạn sau 1 giờ. */
  private toAuditImageRef(value: unknown): unknown {
    if (typeof value !== 'string' || !/^https?:\/\//.test(value)) return value;
    if (!this.storage.isTrustedObjectHost(value)) return value;
    try {
      return decodeURIComponent(new URL(value).pathname.replace(/^\/+/, ''));
    } catch {
      return value;
    }
  }

  /** Ảnh sản phẩm chỉ được trỏ tới object của chính PO này, hoặc ảnh gốc của
   * Mẫu Fit nguồn (khi import). Không thì client có thể gán key bất kỳ trong
   * bucket rồi để BE ký URL đọc nó. */
  private toProductImageKey(
    value: string | null | undefined,
    poId: string,
    sourceStyleId?: string | null,
  ): string | null {
    const key = this.toStoredImageRef(value);
    if (!key) return null;
    const inScope =
      isObjectKeyInScope(key, `purchase-orders/${poId}/`) ||
      (Boolean(sourceStyleId) &&
        isObjectKeyInScope(key, `styles/${sourceStyleId}/`));
    if (!inScope) {
      throw new BadRequestException('Ảnh sản phẩm không hợp lệ.');
    }
    return key;
  }

  private toStoredImageRef(value: string | null | undefined): string | null {
    if (!value) return null;
    return this.toAuditImageRef(value.trim()) as string;
  }

  private toStoredSizeData(sizeData: unknown): unknown {
    if (!Array.isArray(sizeData)) return sizeData;
    return sizeData.map((item) =>
      item &&
      typeof item === 'object' &&
      typeof (item as { imageUrl?: unknown }).imageUrl === 'string'
        ? {
            ...item,
            imageUrl: this.toStoredImageRef(
              (item as { imageUrl: string }).imageUrl,
            ),
          }
        : item,
    );
  }

  private toStoredImageGroups(imageGroups: unknown): any[] {
    if (!Array.isArray(imageGroups)) return [];
    return imageGroups.map((group) =>
      group && typeof group === 'object' && Array.isArray(group.imageUrls)
        ? {
            ...group,
            imageUrls: (group.imageUrls as unknown[]).map((url) =>
              typeof url === 'string' ? this.toStoredImageRef(url) : url,
            ),
          }
        : group,
    );
  }

  /** Ngược lại với toStoredImageRef: key trong DB phải ký lại mỗi lần đọc. */
  private async resolveImageRef(
    value: string | null | undefined,
  ): Promise<string | null> {
    if (!value) return null;
    if (/^https?:\/\//.test(value)) return value;
    if (!isResolvableObjectKey(value)) return value;
    return this.storage.getPresignedGetUrl(value);
  }

  private productionDocAuditSnapshot(
    doc: ProductionDocument | null,
  ): AuditSnapshot | null {
    const snapshot = auditSnapshot(doc, PRODUCTION_DOC_AUDIT_FIELDS);
    if (!snapshot) return null;
    snapshot.section1ImageUrl = this.toAuditImageRef(snapshot.section1ImageUrl);
    if (Array.isArray(snapshot.sizeData)) {
      snapshot.sizeData = (snapshot.sizeData as unknown[]).map((item) =>
        item && typeof item === 'object' && 'imageUrl' in item
          ? {
              ...item,
              imageUrl: this.toAuditImageRef(
                (item as { imageUrl: unknown }).imageUrl,
              ),
            }
          : item,
      );
    }
    return snapshot;
  }

  async create(
    dto: CreatePurchaseOrderDto,
    userId?: string,
    actor?: AuditActor,
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

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const deadlineStr = toYmdString(dto.deadline);
    const receivedDateStr = toYmdString(dto.receivedDate);

    if (deadlineStr < todayStr) {
      throw new BadRequestException(
        'Hạn hoàn thành (deadline) không được ở trong quá khứ.',
      );
    }

    if (deadlineStr <= receivedDateStr) {
      throw new BadRequestException(
        'Hạn hoàn thành (deadline) phải sau ngày nhận PO.',
      );
    }

    const now = new Date();
    const poEntity = this.poRepo.create({
      poCode: dto.poCode,
      customerPoCode: dto.customerPoCode || null,
      customerId: customerId || null,
      customerNameSnapshot: dto.customerNameSnapshot,
      receivedDate: new Date(dto.receivedDate),
      deadline: dto.deadline ? new Date(dto.deadline) : null,
      note: dto.note || null,
      status: PoStatus.DRAFT,
      createdBy: userId || null,
      createdAt: now,
      updatedAt: now,
    });

    const savedPo = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(PurchaseOrder, poEntity);
      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PO,
        aggregateId: saved.id,
        targetLabel: saved.poCode,
        eventType: AuditEventType.CREATED,
        changes: auditDiff(null, saved, PO_AUDIT_FIELDS),
      });
      return saved;
    });

    return this.findOne(savedPo.id);
  }

  /**
   * Áp các bộ lọc dùng chung cho danh sách PO — trừ status, để dùng lại được
   * cho cả truy vấn phân trang chính lẫn truy vấn đếm theo trạng thái (đếm
   * theo status thì không thể tự lọc theo chính status đang đếm).
   */
  private applyPoListFilters(
    qb: ReturnType<Repository<PurchaseOrder>['createQueryBuilder']>,
    query: QueryPurchaseOrderDto,
  ): void {
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
  }

  async findAll(query: QueryPurchaseOrderDto): Promise<
    PaginatedPoResult<PurchaseOrder & { productsCount: number }> & {
      statusCounts: Record<string, number>;
    }
  > {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const qb = this.poRepo.createQueryBuilder('po');
    this.applyPoListFilters(qb, query);

    if (query.status) {
      qb.andWhere('po.status = :status', { status: query.status });
    }

    const sortColumn = query.sortBy || 'createdAt';
    const allowedSortColumns: Record<string, string> = {
      createdAt: 'po.createdAt',
      poCode: 'po.poCode',
      receivedDate: 'po.receivedDate',
      deadline: 'po.deadline',
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

    // Đếm theo trạng thái trên cùng bộ lọc search/ngày (không lọc theo status
    // vì đây chính là chiều đang đếm) — để 4 thẻ tổng quan ở PO List phản
    // ánh đúng số liệu trên toàn bộ kết quả tìm kiếm, không chỉ 10 dòng của
    // trang hiện tại.
    const statusCountsQb = this.poRepo.createQueryBuilder('po');
    this.applyPoListFilters(statusCountsQb, query);
    const statusCountsRaw = await statusCountsQb
      .select('po.status', 'status')
      .addSelect('COUNT(po.id)', 'count')
      .groupBy('po.status')
      .getRawMany<{ status: string; count: string }>();
    const statusCounts = statusCountsRaw.reduce(
      (acc, row) => {
        acc[row.status] = Number(row.count) || 0;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      items: itemsWithCounts,
      total,
      page,
      limit,
      totalPages,
      statusCounts,
    };
  }

  /**
   * Thông tin chung của PO. Chỉ đọc bảng purchase_orders cộng hai câu đếm —
   * không nạp sản phẩm, tài liệu hay lịch sử, và không gọi S3.
   */
  async findOne(id: string): Promise<PurchaseOrderDetailResponse> {
    const po = await this.poRepo.findOne({ where: { id } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${id}`);
    }

    const [productsCount, documentsCount] = await Promise.all([
      this.productRepo.count({ where: { purchaseOrderId: id } }),
      this.poDocRepo.count({ where: { purchaseOrderId: id } }),
    ]);

    return {
      id: po.id,
      poCode: po.poCode,
      customerPoCode: po.customerPoCode,
      customerId: po.customerId,
      customerNameSnapshot: po.customerNameSnapshot,
      receivedDate: po.receivedDate,
      deadline: po.deadline || null,
      note: po.note,
      status: po.status,
      cancellationReason: po.cancellationReason,
      closedAt: po.closedAt,
      closedBy: po.closedBy,
      createdBy: po.createdBy,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
      productsCount,
      documentsCount,
    };
  }

  /**
   * Danh sách tài liệu đã gắn vào PO.
   *
   * URL tải được ký lại ở mỗi lần đọc — không bao giờ lưu presigned URL xuống
   * DB vì nó hết hạn sau PRESIGN_GET_EXPIRY_SECONDS.
   */
  async getDocuments(
    id: string,
    query: QueryPoDocumentDto = {},
  ): Promise<PaginatedPoResult<PoDocumentResponse>> {
    const po = await this.poRepo.findOne({
      where: { id },
      select: { id: true },
    });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${id}`);
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;

    const where = {
      purchaseOrderId: id,
      ...(query.purpose ? { purpose: query.purpose } : {}),
    };

    const [poDocs, total] = await this.poDocRepo.findAndCount({
      where,
      order: { linkedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const emptyResult = {
      items: [] as PoDocumentResponse[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
    if (poDocs.length === 0) return emptyResult;

    const docIds = poDocs.map((pd) => pd.documentId);
    const docs = await this.docRepo.find({ where: { id: In(docIds) } });
    const docsMap = new Map(docs.map((d) => [d.id, d]));

    const allVersions = await this.docVersionRepo.find({
      where: { documentId: In(docIds) },
      order: { versionNo: 'DESC' },
    });
    const docVersionsMap = new Map(allVersions.map((v) => [v.id, v]));

    const items = await Promise.all(
      poDocs.map(async (pd) => {
        const masterDoc = docsMap.get(pd.documentId);
        const version = masterDoc?.currentVersionId
          ? docVersionsMap.get(masterDoc.currentVersionId)
          : null;
        const versions = allVersions.filter(
          (v) => v.documentId === pd.documentId,
        );
        return {
          documentId: pd.documentId,
          documentCode: masterDoc?.documentCode || null,
          title: masterDoc?.title || 'Tài liệu PO',
          purpose: pd.purpose,
          linkedAt: pd.linkedAt,
          fileUrl: version?.storageKey
            ? await this.storage.getPresignedGetUrl(version.storageKey)
            : null,
          fileName: version?.originalFileName || masterDoc?.title || null,
          fileSize: version?.byteSize ? Number(version.byteSize) : null,
          currentVersionNo: version?.versionNo || versions[0]?.versionNo || 1,
          versions: await Promise.all(
            versions.map(async (v) => ({
              id: v.id,
              versionNo: v.versionNo,
              originalFileName: v.originalFileName,
              fileUrl: isResolvableObjectKey(v.storageKey)
                ? await this.storage.getPresignedGetUrl(v.storageKey)
                : null,
              fileSize: v.byteSize ? Number(v.byteSize) : null,
              changeReason: v.changeReason,
              evidenceFileName: v.evidenceFileName,
              evidenceUrl: v.evidenceStorageKey
                ? await this.storage.getPresignedGetUrl(v.evidenceStorageKey)
                : null,
              uploadedAt: v.uploadedAt,
              uploadedBy: v.uploadedBy,
            })),
          ),
        };
      }),
    );

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
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
    actor?: AuditActor,
  ): Promise<PurchaseOrderDetailResponse> {
    const po = await this.poRepo.findOne({ where: { id } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${id}`);
    }

    this.checkPoNotLocked(po, 'chỉnh sửa thông tin');
    const before = { ...po };

    if (dto.deadline !== undefined && !dto.deadline) {
      throw new BadRequestException(
        'Hạn hoàn thành (deadline) không được để trống hoặc mang giá trị null.',
      );
    }

    const newDeadlineStr =
      dto.deadline !== undefined ? toYmdString(dto.deadline) : null;
    const targetReceivedDate = dto.receivedDate || po.receivedDate;
    const targetReceivedDateStr = targetReceivedDate
      ? toYmdString(targetReceivedDate)
      : '';

    if (newDeadlineStr) {
      if (targetReceivedDateStr && newDeadlineStr <= targetReceivedDateStr) {
        throw new BadRequestException(
          'Hạn hoàn thành (deadline) phải sau ngày nhận PO.',
        );
      }
    } else if (dto.receivedDate && po.deadline && dto.deadline === undefined) {
      const currentDeadlineStr = toYmdString(po.deadline);
      if (
        currentDeadlineStr &&
        currentDeadlineStr <= toYmdString(dto.receivedDate)
      ) {
        throw new BadRequestException(
          'Hạn hoàn thành (deadline) phải sau ngày nhận PO.',
        );
      }
    }

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
    if (dto.deadline !== undefined) {
      po.deadline = new Date(dto.deadline);
    }
    if (dto.note !== undefined) {
      po.note = dto.note || null;
    }

    po.updatedBy = userId || null;
    po.updatedAt = new Date();

    await this.dataSource.transaction(async (manager) => {
      await manager.save(PurchaseOrder, po);
      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PO,
        aggregateId: po.id,
        targetLabel: po.poCode,
        eventType: AuditEventType.UPDATED,
        changes: auditDiff(before, po, PO_AUDIT_FIELDS),
      });
    });

    return this.findOne(id);
  }

  async updateStatus(
    id: string,
    dto: UpdatePoStatusDto,
    userId?: string,
    actor?: AuditActor,
  ): Promise<PurchaseOrderDetailResponse> {
    const po = await this.poRepo.findOne({ where: { id } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${id}`);
    }
    const before = { ...po };

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

    const actionText =
      newStatus === PoStatus.PENDING_RD
        ? 'Chuyển sang Chờ R&D'
        : newStatus === PoStatus.IN_PROGRESS
          ? 'Bắt đầu xử lý PO'
          : newStatus === PoStatus.CLOSED
            ? 'Khóa PO'
            : 'Hủy đơn hàng PO';
    const reason = dto.reason?.trim();

    await this.dataSource.transaction(async (manager) => {
      await manager.save(PurchaseOrder, po);
      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PO,
        aggregateId: po.id,
        targetLabel: po.poCode,
        eventType: AuditEventType.STATUS_CHANGED,
        reason: reason ? `${actionText}: ${reason}` : actionText,
        changes: auditDiff(before, po, PO_AUDIT_FIELDS),
      });
    });

    return this.findOne(id);
  }

  // ─── Documents Management ──────────────────────────────────────────────────

  private async documentAuditLabel(documentId: string): Promise<string> {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    return doc?.title || 'Tài liệu';
  }

  async linkDocument(
    poId: string,
    dto: LinkPoDocumentDto,
    userId?: string,
    actor?: AuditActor,
  ): Promise<PurchaseOrderDetailResponse> {
    const po = await this.poRepo.findOne({ where: { id: poId } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${poId}`);
    }

    this.checkPoNotLocked(po, 'thay đổi tài liệu');

    const existingLink = await this.poDocRepo.findOne({
      where: { purchaseOrderId: poId, documentId: dto.documentId },
    });
    const targetLabel = await this.documentAuditLabel(dto.documentId);

    await this.dataSource.transaction(async (manager) => {
      if (existingLink) {
        const oldPurpose = existingLink.purpose;
        existingLink.purpose = dto.purpose;
        if (userId) existingLink.linkedBy = userId;
        await manager.save(PurchaseOrderDocument, existingLink);
        await this.recordAudit(manager, actor, {
          aggregateType: AUDIT_TYPE.PO_DOCUMENT,
          aggregateId: dto.documentId,
          parentId: poId,
          targetLabel,
          eventType: AuditEventType.UPDATED,
          changes:
            oldPurpose === dto.purpose
              ? []
              : [
                  {
                    fieldName: 'purpose',
                    oldValue: oldPurpose,
                    newValue: dto.purpose,
                  },
                ],
        });
      } else {
        const link = this.poDocRepo.create({
          purchaseOrderId: poId,
          documentId: dto.documentId,
          purpose: dto.purpose,
          linkedBy: userId || null,
          linkedAt: new Date(),
        });
        await manager.save(PurchaseOrderDocument, link);
        await this.recordAudit(manager, actor, {
          aggregateType: AUDIT_TYPE.PO_DOCUMENT,
          aggregateId: dto.documentId,
          parentId: poId,
          targetLabel,
          eventType: AuditEventType.CREATED,
          changes: [
            { fieldName: 'fileName', oldValue: null, newValue: targetLabel },
            { fieldName: 'purpose', oldValue: null, newValue: dto.purpose },
          ],
        });
      }
    });

    return this.findOne(poId);
  }

  async updateDocumentPurpose(
    poId: string,
    documentId: string,
    purpose: DocumentPurpose,
    userId?: string,
    actor?: AuditActor,
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

    const oldPurpose = existingLink.purpose;
    existingLink.purpose = purpose;
    if (userId) existingLink.linkedBy = userId;
    const targetLabel = await this.documentAuditLabel(documentId);

    await this.dataSource.transaction(async (manager) => {
      await manager.save(PurchaseOrderDocument, existingLink);
      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PO_DOCUMENT,
        aggregateId: documentId,
        parentId: poId,
        targetLabel,
        eventType: AuditEventType.UPDATED,
        changes:
          oldPurpose === purpose
            ? []
            : [
                {
                  fieldName: 'purpose',
                  oldValue: oldPurpose,
                  newValue: purpose,
                },
              ],
      });
    });

    return this.findOne(poId);
  }

  async unlinkDocument(
    poId: string,
    documentId: string,
    actor?: AuditActor,
  ): Promise<void> {
    const po = await this.poRepo.findOne({ where: { id: poId } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${poId}`);
    }
    this.checkPoNotLocked(po, 'gỡ tài liệu');

    const existingLink = await this.poDocRepo.findOne({
      where: { purchaseOrderId: poId, documentId },
    });
    if (!existingLink) return;

    const targetLabel = await this.documentAuditLabel(documentId);
    await this.dataSource.transaction(async (manager) => {
      await manager.remove(PurchaseOrderDocument, existingLink);
      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PO_DOCUMENT,
        aggregateId: documentId,
        parentId: poId,
        targetLabel,
        eventType: AuditEventType.DELETED,
        reason: `Gỡ tài liệu ${targetLabel}`,
        changes: [],
      });
    });
  }

  /**
   * Đọc đủ byte để kiểm tra chữ ký tệp, không hơn.
   *
   * Chữ ký magic dài nhất là 12 byte (WEBP), nên với tệp nhị phân chỉ cần khúc
   * đầu. Trước đây cả ba luồng confirm đều kéo nguyên tệp từ S3 về chỉ để xem
   * mấy byte đó: đo thực tế, confirm một tệp 5 MB mất 17,9 giây trong tổng 19
   * giây, trong khi trình duyệt đẩy tệp lên S3 chỉ hết 0,98 giây.
   *
   * Riêng nhóm văn bản vẫn tải đầy đủ, vì bộ kiểm tra quét NUL byte trên toàn
   * bộ nội dung chứ không chỉ phần đầu.
   */
  private async readBytesForMagicCheck(
    objectKey: string,
    ext: string,
  ): Promise<Buffer> {
    if (TEXT_EXTENSIONS_SCANNED_IN_FULL.has(ext)) {
      return this.storage.getObjectBuffer(objectKey);
    }
    return this.storage.getObjectHead(objectKey, MAGIC_BYTES_SAMPLE_SIZE);
  }

  /**
   * Chặn `objectKey` trỏ ra ngoài phạm vi đang thao tác.
   *
   * Client tự gửi objectKey lên; trước đây không có ràng buộc nào, nên gắn tệp
   * của PO khác (hay của module Style) vào PO này chỉ bị chặn nhờ UNIQUE index
   * trên document_versions.storage_key — một rào cản tình cờ, và nó không chặn
   * được object mồ côi vì loại đó chưa có bản ghi trong DB.
   */
  private assertObjectKeyInScope(
    objectKey: string,
    expectedPrefix: string,
  ): void {
    if (!objectKey.startsWith(expectedPrefix)) {
      throw new BadRequestException(
        'objectKey không thuộc phạm vi tải lên này, vui lòng lấy lại link upload.',
      );
    }
  }

  /**
   * Đổi lỗi trùng storage_key thành 400 có thông báo đọc được.
   *
   * Không bọc thì TypeORM ném QueryFailedError ra ngoài thành 500 kèm nguyên
   * tên ràng buộc trong DB.
   */
  private rethrowDuplicateStorageKey(error: unknown): never {
    const message =
      error instanceof Error ? error.message : String(error ?? '');
    if (message.includes('document_versions_storage_key_key')) {
      throw new BadRequestException(
        'Tệp này đã được đăng ký trong hệ thống, không thể đính kèm lại.',
      );
    }
    throw error;
  }

  /**
   * Chặn tên màu trống/trùng và tên size trống/trùng trong cùng 1 màu. DTO
   * (@IsNotEmpty) chỉ chặn chuỗi rỗng tuyệt đối, không chặn được chuỗi toàn
   * khoảng trắng lẫn trùng lặp giữa các dòng — cả hai đều phải kiểm ở đây.
   */
  private validateColorsBusinessRules(colors: ProductColorItemDto[]): void {
    const seenColorNames = new Set<string>();
    for (const c of colors) {
      const name = c.colorName.trim();
      if (!name) {
        throw new BadRequestException(
          'Tên màu không được để trống hoặc chỉ chứa khoảng trắng.',
        );
      }
      if (seenColorNames.has(name)) {
        throw new BadRequestException(
          `Màu "${name}" bị lặp lại — mỗi màu chỉ được khai báo một lần.`,
        );
      }
      seenColorNames.add(name);

      const seenSizeLabels = new Set<string>();
      for (const s of c.sizes || []) {
        const label = s.sizeLabel.trim();
        if (!label) {
          throw new BadRequestException(
            `Tên size trong màu "${name}" không được để trống.`,
          );
        }
        if (seenSizeLabels.has(label)) {
          throw new BadRequestException(
            `Size "${label}" bị lặp lại trong màu "${name}".`,
          );
        }
        seenSizeLabels.add(label);
      }
    }
  }

  /**
   * Đổi lỗi trùng/âm ở tầng DB (unique_violation, check_violation) thành lỗi
   * đọc được — lưới an toàn cho trường hợp hiếm khi 2 request race qua được
   * validate ở tầng service nhưng đụng độ ngay tại DB.
   */
  private rethrowColorConstraintViolation(error: unknown): never {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
    const constraint =
      typeof error === 'object' && error !== null && 'constraint' in error
        ? (error as { constraint?: unknown }).constraint
        : undefined;

    if (code === '23505') {
      if (constraint === 'uq_product_color') {
        throw new ConflictException('Màu này đã tồn tại trong sản phẩm.');
      }
      if (constraint === 'uq_product_color_size') {
        throw new ConflictException('Size này đã tồn tại trong màu.');
      }
      throw new ConflictException('Dữ liệu màu/size bị trùng lặp.');
    }
    if (code === '23514') {
      throw new BadRequestException('Số lượng (pcs) không được là số âm.');
    }
    if (code === '23503') {
      throw new ConflictException(
        'Không thể xóa màu này vì đang được tham chiếu ở nơi khác (ví dụ ảnh mẫu).',
      );
    }
    throw error;
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

  async presignDocument(
    poId: string,
    dto: PresignPoDocumentDto,
  ): Promise<{ objectKey: string; uploadUrl: string; expiresIn: number }> {
    const po = await this.poRepo.findOne({ where: { id: poId } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${poId}`);
    }
    this.checkPoNotLocked(po, 'tải lên tài liệu mới');

    assertAllowedFile(dto.fileName, dto.mimeType, dto.sizeBytes, {
      allowlist: ALLOWED_PO_MIME_BY_EXTENSION,
      maxSizeBytes: PO_DOCUMENT_MAX_SIZE_BYTES,
    });

    const ext = path.extname(dto.fileName).toLowerCase();
    const objectKey = `purchase-orders/${poId}/documents/${dto.purpose}/${randomUUID()}${ext}`;

    const uploadUrl = await this.storage.getPresignedPutUrl(
      objectKey,
      dto.mimeType,
      PRESIGN_PUT_EXPIRY_SECONDS,
    );

    return { objectKey, uploadUrl, expiresIn: PRESIGN_PUT_EXPIRY_SECONDS };
  }

  async confirmDocument(
    poId: string,
    userId: string | undefined,
    dto: ConfirmPoDocumentDto,
    actor?: AuditActor,
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

    this.assertObjectKeyInScope(
      dto.objectKey,
      `purchase-orders/${poId}/documents/`,
    );

    const head = await this.storage.headObject(dto.objectKey);
    if (!head.exists) {
      throw new BadRequestException(
        'Tệp chưa được tải lên thành công, vui lòng thử upload lại.',
      );
    }

    // Server never receives the raw upload (client PUTs straight to S3 with a
    // presigned URL), so the magic-bytes check that used to run on the multer
    // buffer must run here instead, against the bytes actually stored on S3.
    const ext = (path.extname(dto.fileName) || '').toLowerCase();
    const buffer = await this.readBytesForMagicCheck(dto.objectKey, ext);
    this.validateFileMagicBytes(ext, buffer);

    const now = new Date();

    return this.dataSource
      .transaction(async (manager) => {
        const docRepo = manager.getRepository(Document);
        const versionRepo = manager.getRepository(DocumentVersion);
        const poDocRepo = manager.getRepository(PurchaseOrderDocument);

        const doc = await docRepo.save(
          docRepo.create({
            documentCode: `DOC-PO-${Date.now().toString().slice(-6)}`,
            title: dto.fileName,
            createdBy: userId || (null as any),
            createdAt: now,
          }),
        );

        const version = await versionRepo.save(
          versionRepo.create({
            documentId: doc.id,
            versionNo: 1,
            originalFileName: dto.fileName,
            storageKey: dto.objectKey,
            mimeType: dto.mimeType,
            byteSize: dto.sizeBytes,
            status: UploadStatus.READY,
            uploadedBy: userId || (null as any),
            uploadedAt: now,
          }),
        );

        doc.currentVersionId = version.id;
        await docRepo.save(doc);

        await poDocRepo.save(
          poDocRepo.create({
            purchaseOrderId: poId,
            documentId: doc.id,
            purpose: dto.purpose,
            linkedBy: userId || (null as any),
            linkedAt: now,
          }),
        );

        await this.recordAudit(manager, actor, {
          aggregateType: AUDIT_TYPE.PO_DOCUMENT,
          aggregateId: doc.id,
          parentId: poId,
          targetLabel: dto.fileName,
          eventType: AuditEventType.CREATED,
          changes: [
            { fieldName: 'fileName', oldValue: null, newValue: dto.fileName },
            { fieldName: 'purpose', oldValue: null, newValue: dto.purpose },
          ],
        });

        return {
          documentId: doc.id,
          documentCode: doc.documentCode,
          title: doc.title,
          purpose: String(dto.purpose),
          linkedAt: now,
          fileUrl: await this.storage.getPresignedGetUrl(
            dto.objectKey,
            PRESIGN_GET_EXPIRY_SECONDS,
          ),
          fileName: dto.fileName,
          fileSize: dto.sizeBytes,
        };
      })
      .catch((e) => this.rethrowDuplicateStorageKey(e));
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
        baseImageVersionId: style.baseImageKey,
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
  async getProducts(poId: string, query: QueryPoProductDto = {}) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;

    const [products, total] = await this.productRepo.findAndCount({
      where: { purchaseOrderId: poId },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const meta = {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };

    if (products.length === 0) return { items: [], ...meta };

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

    const items = await Promise.all(
      products.map(async (prod) => {
        const sourceStyle = prod.sourceStyleId
          ? stylesMap.get(prod.sourceStyleId)
          : null;
        const productColors = colorsByProductId[prod.id] || [];
        const totalQuantity = productColors.reduce(
          (sum, c) => sum + (Number(c.totalQuantity) || 0),
          0,
        );

        // structureImageVersionId lưu object key S3, không phải URL. Client
        // không tự ký được nên phải resolve ở đây, giống baseImageKey của
        // Style. Khóa `/uploads/...` cũ thì bỏ qua — tệp không có trên S3.
        const structureImageUrl = isResolvableObjectKey(
          prod.structureImageVersionId,
        )
          ? await this.storage.getPresignedGetUrl(prod.structureImageVersionId)
          : null;

        // Liệt kê tường minh thay vì `...prod`: entity còn mang các cột nội bộ
        // (rowVersion, previousStatus, createdBy/updatedBy, closedBy...) không
        // nên lọt ra API.
        return {
          id: prod.id,
          purchaseOrderId: prod.purchaseOrderId,
          sourceStyleId: prod.sourceStyleId,
          productCode: prod.productCode,
          productName: prod.productName,
          category: prod.category,
          materialNote: prod.materialNote,
          deadline: prod.deadline,
          structureImageVersionId: prod.structureImageVersionId,
          structureImageUrl,
          status: prod.status,
          cancellationReason: prod.cancellationReason,
          closedAt: prod.closedAt,
          as3bCmBaseDays: prod.as3bCmBaseDays,
          importedAt: prod.importedAt,
          importedBy: prod.importedBy,
          createdAt: prod.createdAt,
          updatedAt: prod.updatedAt,
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
      }),
    );

    return { items, ...meta };
  }

  /**
   * Lấy thông tin chung 1 sản phẩm (tab Thông tin). Size/màu, quy trình công
   * đoạn, đợt may mẫu, tài liệu SX, tài liệu đính kèm đọc qua endpoint riêng
   * của từng tab — không kéo hết về đây (mỗi tab trả tiền cho đúng dữ liệu
   * nó hiển thị, xem CLAUDE.md).
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

    const sourceStyle = product.sourceStyleId
      ? await this.styleRepo.findOne({ where: { id: product.sourceStyleId } })
      : null;

    // Liệt kê tường minh thay vì `...product`, cùng lý do như getProducts:
    // entity còn mang rowVersion, previousStatus, createdBy/updatedBy, closedBy.
    return {
      id: product.id,
      purchaseOrderId: product.purchaseOrderId,
      sourceStyleId: product.sourceStyleId,
      productCode: product.productCode,
      productName: product.productName,
      category: product.category,
      materialNote: product.materialNote,
      deadline: product.deadline,
      structureImageVersionId: product.structureImageVersionId,
      structureImageUrl: isResolvableObjectKey(product.structureImageVersionId)
        ? await this.storage.getPresignedGetUrl(product.structureImageVersionId)
        : null,
      status: product.status,
      cancellationReason: product.cancellationReason,
      closedAt: product.closedAt,
      as3bCmBaseDays: product.as3bCmBaseDays,
      importedAt: product.importedAt,
      importedBy: product.importedBy,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      sourceStyle: sourceStyle
        ? {
            id: sourceStyle.id,
            styleCode: sourceStyle.styleCode,
            styleName: sourceStyle.styleName,
            category: sourceStyle.category,
          }
        : null,
    };
  }

  /**
   * Lấy bảng màu & size của sản phẩm (tab Màu / tóm tắt tab Thông tin).
   */
  async getProductColors(productId: string) {
    const rawColors = await this.productColorRepo.find({
      where: { productId },
      order: { orderIndex: 'ASC' },
    });
    if (rawColors.length === 0) {
      return { colors: [], totalQuantity: 0 };
    }

    const colorIds = rawColors.map((c) => c.id);
    const sizes = await this.productColorSizeRepo.find({
      where: { productColorId: In(colorIds) },
      order: { orderIndex: 'ASC' },
    });
    let totalQuantity = 0;
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

    const colors = rawColors.map((c) => {
      const colorSizes = sizesByColor[c.id] || [];
      const colorQty = colorSizes.reduce(
        (sum, s) => sum + (Number(s.quantity) || 0),
        0,
      );
      return {
        id: c.id,
        colorName: c.colorName,
        orderIndex: c.orderIndex,
        sizes: colorSizes,
        totalQuantity: colorQty,
      };
    });

    return { colors, totalQuantity };
  }

  /**
   * Lấy tài liệu đính kèm sản phẩm kèm toàn bộ phiên bản (tab Tài liệu đính
   * kèm / lọc bảng màu ở tab Màu). Ký lại link S3 mỗi lần đọc — không lưu
   * link đã ký (xem PRESIGN_GET_EXPIRY_SECONDS).
   */
  async getProductDocuments(productId: string, purpose?: string) {
    if (
      purpose &&
      !Object.values(DocumentPurpose).includes(purpose as DocumentPurpose)
    ) {
      throw new BadRequestException(`purpose không hợp lệ: ${purpose}`);
    }
    const productDocs = await this.productDocRepo.find({
      where: purpose
        ? { productId, purpose: purpose as DocumentPurpose }
        : { productId },
      order: { linkedAt: 'DESC' },
    });
    if (productDocs.length === 0) return [];

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

    return Promise.all(
      productDocs.map(async (pd) => {
        const masterDoc = docsMap.get(pd.documentId);
        const docVersions = versionsByDoc[pd.documentId] || [];
        const currentVersion =
          (masterDoc?.currentVersionId &&
            docVersions.find((v) => v.id === masterDoc.currentVersionId)) ||
          docVersions[0] ||
          null;

        // fileUrl trước đây trả thẳng storageKey — đó là object key của S3,
        // không phải URL, nên mọi link tải/xem tài liệu của sản phẩm đều hỏng.
        // Ký lại ở mỗi lần đọc, giống cách tài liệu PO và ảnh Style vẫn làm.
        const signedCurrentUrl = isResolvableObjectKey(
          currentVersion?.storageKey,
        )
          ? await this.storage.getPresignedGetUrl(currentVersion.storageKey)
          : null;

        const signedVersions = await Promise.all(
          docVersions.map(async (v) => ({
            id: v.id,
            versionNo: v.versionNo,
            originalFileName: v.originalFileName,
            fileUrl: isResolvableObjectKey(v.storageKey)
              ? await this.storage.getPresignedGetUrl(v.storageKey)
              : null,
            fileSize: v.byteSize ? Number(v.byteSize) : null,
            mimeType: v.mimeType,
            changeReason: v.changeReason,
            evidenceFileName: v.evidenceFileName,
            evidenceUrl: v.evidenceStorageKey
              ? await this.storage.getPresignedGetUrl(v.evidenceStorageKey)
              : null,
            uploadedAt: v.uploadedAt,
            uploadedBy: v.uploadedBy,
          })),
        );

        return {
          documentId: pd.documentId,
          productId: pd.productId,
          purpose: pd.purpose,
          linkedAt: pd.linkedAt,
          sourcePoDocument: pd.sourcePoDocument ?? null,
          title:
            masterDoc?.title || currentVersion?.originalFileName || 'Tài liệu',
          documentCode: masterDoc?.documentCode || null,
          fileName:
            currentVersion?.originalFileName || masterDoc?.title || null,
          fileUrl: signedCurrentUrl,
          fileSize: currentVersion?.byteSize
            ? Number(currentVersion.byteSize)
            : null,
          currentVersionNo: currentVersion?.versionNo || 1,
          changeReason: currentVersion?.changeReason || null,
          versions: signedVersions,
        };
      }),
    );
  }

  /**
   * Tạo mới Product trong PO (có thể tạo độc lập hoặc import deep clone từ Style)
   * Đảm bảo sau khi import là bản riêng của Product, sửa/xóa không ảnh hưởng Style nguồn.
   */
  async addProduct(
    poId: string,
    dto: CreatePoProductDto,
    userId?: string,
    actor?: AuditActor,
  ): Promise<PurchaseOrderProduct> {
    const po = await this.poRepo.findOne({ where: { id: poId } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy PO #${poId}`);
    }
    if (po.status === PoStatus.CANCELLED) {
      throw new BadRequestException(
        'Đơn hàng PO đã hủy, không thể thêm sản phẩm mới.',
      );
    }
    if (po.status === PoStatus.CLOSED) {
      throw new BadRequestException(
        'Đơn hàng PO đã khóa hoặc đã hủy, không thể thêm sản phẩm',
      );
    }

    if (typeof dto.deadline !== 'string' || !dto.deadline.trim()) {
      throw new BadRequestException(
        'Hạn giao (deadline) là bắt buộc khi tạo sản phẩm.',
      );
    }
    if (toYmdString(dto.deadline) < getVietnamBusinessDateYmd()) {
      throw new BadRequestException(
        'Hạn giao sản phẩm không được là ngày trong quá khứ.',
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
    const targetDeadline = new Date(dto.deadline);
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
        deadline: targetDeadline,
        structureImageVersionId:
          this.toProductImageKey(
            dto.structureImageVersionId,
            poId,
            sourceStyleId,
          ) ||
          sourceStyle?.baseImageKey ||
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
              feedback: round.feedback ?? undefined,
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
        //
        // Mỗi tài liệu được nhân bản thành một `Document`/`DocumentVersion` MỚI,
        // KHÔNG link thẳng vào documentId của Style. Nếu link thẳng, một lần
        // tải phiên bản mới ở phía Product (confirmProductDocumentVersion) sẽ
        // ghi đè `currentVersionId` của Document gốc và làm lộ thay đổi ngược
        // lại cho Style nguồn — vi phạm yêu cầu "sửa Product không đổi Style
        // nguồn". `document_versions.storage_key` có UNIQUE constraint nên
        // cũng không thể tái dùng storageKey gốc cho version mới — phải
        // `copyObject` file sang một key riêng trên S3 trước.
        if (opts.copyDocuments !== false) {
          const styleDocs = await manager.find(StyleDocument, {
            where: { styleId: sourceStyleId },
          });
          const docsToCopy = opts.selectedDocumentIds?.length
            ? styleDocs.filter((d) =>
                opts.selectedDocumentIds?.includes(d.documentId),
              )
            : styleDocs;

          for (const styleDoc of docsToCopy) {
            const sourceDoc = await manager.findOne(Document, {
              where: { id: styleDoc.documentId },
            });
            if (!sourceDoc) continue;

            const sourceVersion = sourceDoc.currentVersionId
              ? await manager.findOne(DocumentVersion, {
                  where: { id: sourceDoc.currentVersionId },
                })
              : null;
            if (!sourceVersion) continue;

            const ext = path.extname(sourceVersion.originalFileName || '');
            const clonedObjectKey = `purchase-orders/${poId}/products/${savedProduct.id}/documents/imported-from-style/${randomUUID()}${ext}`;
            await this.storage.copyObject(
              sourceVersion.storageKey,
              clonedObjectKey,
            );

            const clonedDoc = await manager.save(
              Document,
              manager.create(Document, {
                documentCode: `DOC-PROD-${Date.now()}-${randomUUID().slice(0, 8)}`,
                title: sourceDoc.title,
                createdBy: userId,
                createdAt: new Date(),
              }),
            );

            const clonedVersion = await manager.save(
              DocumentVersion,
              manager.create(DocumentVersion, {
                documentId: clonedDoc.id,
                versionNo: 1,
                originalFileName: sourceVersion.originalFileName,
                storageKey: clonedObjectKey,
                mimeType: sourceVersion.mimeType,
                byteSize: sourceVersion.byteSize,
                sha256: sourceVersion.sha256,
                status: sourceVersion.status,
                uploadedBy: userId,
                uploadedAt: new Date(),
              }),
            );

            clonedDoc.currentVersionId = clonedVersion.id;
            await manager.save(Document, clonedDoc);

            await manager.save(
              PurchaseOrderProductDocument,
              manager.create(PurchaseOrderProductDocument, {
                productId: savedProduct.id,
                documentId: clonedDoc.id,
                sourceStyleDocumentId: styleDoc.documentId,
                sourcePoDocument: false,
                purpose: styleDoc.purpose,
                linkedBy: userId,
                linkedAt: new Date(),
              }),
            );
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
        this.validateColorsBusinessRules(dto.colors);

        try {
          for (let cIdx = 0; cIdx < dto.colors.length; cIdx++) {
            const cDto = dto.colors[cIdx];
            const colorEntity = manager.create(PurchaseOrderProductColor, {
              productId: savedProduct.id,
              colorName: cDto.colorName.trim(),
              orderIndex: cIdx,
            });
            const savedColor = await manager.save(
              PurchaseOrderProductColor,
              colorEntity,
            );

            const sizesDto = cDto.sizes || [];
            if (sizesDto.length > 0) {
              const sizeEntities = sizesDto.map((sDto, sIdx) =>
                manager.create(PurchaseOrderProductColorSize, {
                  productColorId: savedColor.id,
                  sizeLabel: sDto.sizeLabel.trim(),
                  quantity: sDto.quantity,
                  orderIndex: sIdx,
                }),
              );
              await manager.save(PurchaseOrderProductColorSize, sizeEntities);
            }
          }
        } catch (error) {
          this.rethrowColorConstraintViolation(error);
        }
      }

      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PRODUCT,
        aggregateId: savedProduct.id,
        parentId: poId,
        targetLabel: productAuditLabel(savedProduct),
        eventType: AuditEventType.CREATED,
        reason: sourceStyle
          ? `Import từ Mẫu Fit ${sourceStyle.styleCode} - ${sourceStyle.styleName}`
          : undefined,
        changes: [
          ...auditDiff(null, savedProduct, PRODUCT_AUDIT_FIELDS),
          ...(dto.colors ?? []).map((color) => ({
            fieldName: `${color.colorName.trim()}::sizes`,
            oldValue: null,
            newValue: formatColorSizes(color.sizes ?? []),
          })),
        ],
      });

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
    actor?: AuditActor,
  ): Promise<PurchaseOrderProduct> {
    const product = await this.assertPoOpenForProduct(
      poId,
      productId,
      'chỉnh sửa sản phẩm',
    );

    if (product.status === ProductStatus.CLOSED) {
      throw new BadRequestException(
        'Sản phẩm đang ở trạng thái Khóa. Vui lòng mở khóa trước khi chỉnh sửa.',
      );
    }
    const before = { ...product };

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
      product.structureImageVersionId = this.toProductImageKey(
        dto.structureImageVersionId,
        poId,
        product.sourceStyleId,
      );

    product.updatedBy = userId || product.updatedBy;
    product.updatedAt = new Date();

    const incomingColors =
      dto.colors === undefined
        ? undefined
        : Array.isArray(dto.colors)
          ? dto.colors
          : [];
    if (incomingColors) this.validateColorsBusinessRules(incomingColors);

    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(PurchaseOrderProduct, product);
      const sizeChanges = incomingColors
        ? await this.replaceProductColors(manager, productId, incomingColors)
        : [];
      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PRODUCT,
        aggregateId: productId,
        parentId: poId,
        targetLabel: productAuditLabel(product),
        eventType: AuditEventType.UPDATED,
        reason: dto.reason || undefined,
        changes: [
          ...auditDiff(before, product, PRODUCT_AUDIT_FIELDS),
          ...sizeChanges,
        ],
      });
      return saved;
    });
  }

  /**
   * Upsert-theo-id, không phải xóa hết rồi tạo lại — xóa-rồi-tạo-lại sẽ đổi
   * id của MỌI màu mỗi lần lưu. Màu vẫn còn trong dto (dù đổi tên) giữ
   * nguyên id cũ; chỉ màu bị xóa hẳn mới bị xóa thật. Trả về thay đổi size
   * theo từng màu để ghi lịch sử.
   */
  private async replaceProductColors(
    manager: EntityManager,
    productId: string,
    incomingColors: ProductColorItemDto[],
  ): Promise<EntityFieldChange[]> {
    try {
      const existingColors = await manager.find(PurchaseOrderProductColor, {
        where: { productId },
      });
      const existingSizes =
        existingColors.length === 0
          ? []
          : await manager.find(PurchaseOrderProductColorSize, {
              where: { productColorId: In(existingColors.map((c) => c.id)) },
              order: { orderIndex: 'ASC' },
            });
      const oldSizesByColorId = new Map(
        existingColors.map((c) => [
          c.id,
          formatColorSizes(
            existingSizes.filter((s) => s.productColorId === c.id),
          ),
        ]),
      );
      const existingById = new Map(existingColors.map((c) => [c.id, c]));
      const keptIds = new Set<string>();
      const changes: EntityFieldChange[] = [];

      for (let cIdx = 0; cIdx < incomingColors.length; cIdx++) {
        const cDto = incomingColors[cIdx];
        const colorName = cDto.colorName.trim();
        const existing = cDto.id ? existingById.get(cDto.id) : undefined;
        const oldName = existing?.colorName;

        let savedColor: PurchaseOrderProductColor;
        if (existing) {
          existing.colorName = colorName;
          existing.orderIndex = cIdx;
          savedColor = await manager.save(PurchaseOrderProductColor, existing);
        } else {
          const newColor = manager.create(PurchaseOrderProductColor, {
            productId,
            colorName,
            orderIndex: cIdx,
          });
          savedColor = await manager.save(PurchaseOrderProductColor, newColor);
        }
        keptIds.add(savedColor.id);

        // Chưa có bảng nào tham chiếu id của từng size — thay hết cho
        // gọn là an toàn, chỉ id của MÀU mới cần giữ ổn định.
        await manager.delete(PurchaseOrderProductColorSize, {
          productColorId: savedColor.id,
        });
        const sizesDto = cDto.sizes || [];
        if (sizesDto.length > 0) {
          const sizeEntities = sizesDto.map((sDto, sIdx) =>
            manager.create(PurchaseOrderProductColorSize, {
              productColorId: savedColor.id,
              sizeLabel: sDto.sizeLabel.trim(),
              quantity: sDto.quantity,
              orderIndex: sIdx,
            }),
          );
          await manager.save(PurchaseOrderProductColorSize, sizeEntities);
        }

        const oldSizes = existing
          ? (oldSizesByColorId.get(existing.id) ?? null)
          : null;
        const newSizes = formatColorSizes(
          sizesDto.map((s) => ({ ...s, sizeLabel: s.sizeLabel.trim() })),
        );
        if (oldName !== undefined && oldName !== colorName) {
          changes.push({
            fieldName: `${colorName}::colorName`,
            oldValue: oldName,
            newValue: colorName,
          });
        }
        if (oldSizes !== newSizes) {
          changes.push({
            fieldName: `${colorName}::sizes`,
            oldValue: oldSizes,
            newValue: newSizes,
          });
        }
      }

      const removedColors = existingColors.filter((c) => !keptIds.has(c.id));
      if (removedColors.length > 0) {
        const removedIds = removedColors.map((c) => c.id);
        await manager.delete(PurchaseOrderProductColorSize, {
          productColorId: In(removedIds),
        });
        await manager.delete(PurchaseOrderProductColor, {
          id: In(removedIds),
        });
        for (const color of removedColors) {
          changes.push({
            fieldName: `${color.colorName}::sizes`,
            oldValue: oldSizesByColorId.get(color.id) ?? null,
            newValue: null,
          });
        }
      }
      return changes;
    } catch (error) {
      this.rethrowColorConstraintViolation(error);
    }
  }

  /**
   * Xóa sản phẩm khỏi PO (Độc lập, giữ nguyên Style nguồn)
   */
  private async deleteProductCascade(
    manager: EntityManager,
    productId: string,
  ): Promise<void> {
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
  }

  async removeProduct(
    poId: string,
    productId: string,
    actor?: AuditActor,
  ): Promise<void> {
    const product = await this.assertPoOpenForProduct(
      poId,
      productId,
      'xóa sản phẩm',
    );

    if (product.status === ProductStatus.CLOSED) {
      throw new BadRequestException(
        'Sản phẩm đang ở trạng thái Khóa. Vui lòng mở khóa trước khi xóa.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      // boms.purchase_order_product_id là ON DELETE RESTRICT — BOM có thể đã
      // duyệt và có giá thành, nên chặn rõ ràng thay vì để DB trả lỗi 500.
      const bom = await manager.findOne(Bom, {
        where: { purchaseOrderProductId: productId },
      });
      if (bom) {
        throw new ConflictException('Sản phẩm đã có NPL, không thể xóa.');
      }
      await this.deleteProductCascade(manager, productId);
      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PRODUCT,
        aggregateId: productId,
        parentId: poId,
        targetLabel: productAuditLabel(product),
        eventType: AuditEventType.DELETED,
        changes: [],
      });
    });
  }

  /**
   * Xóa hẳn một đơn hàng PO cùng toàn bộ dữ liệu con (sản phẩm, màu/size,
   * tài liệu, lịch sử...). Chỉ cho phép khi PO còn ở trạng thái Nháp — PO đã
   * đưa vào xử lý/khóa/hủy thì dùng luồng Hủy (updateStatus) để giữ lại lịch
   * sử thay vì xóa cứng.
   */
  async remove(id: string, actor?: AuditActor): Promise<void> {
    const po = await this.poRepo.findOne({ where: { id } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${id}`);
    }

    if (po.status !== PoStatus.DRAFT) {
      throw new BadRequestException(
        'Chỉ có thể xóa đơn hàng PO khi đang ở trạng thái Nháp. Với PO đã xử lý, vui lòng chuyển trạng thái sang Đã hủy.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const products = await manager.find(PurchaseOrderProduct, {
        where: { purchaseOrderId: id },
      });
      if (products.length > 0) {
        const bom = await manager.findOne(Bom, {
          where: { purchaseOrderProductId: In(products.map((p) => p.id)) },
        });
        if (bom) {
          const owner = products.find(
            (p) => p.id === bom.purchaseOrderProductId,
          );
          throw new ConflictException(
            `Sản phẩm ${owner?.productCode ?? ''} đã có NPL, không thể xóa đơn hàng PO.`,
          );
        }
      }
      for (const product of products) {
        await this.deleteProductCascade(manager, product.id);
      }

      await manager.delete(PurchaseOrderDocument, { purchaseOrderId: id });
      await manager.delete(PurchaseOrder, { id });
      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PO,
        aggregateId: id,
        targetLabel: po.poCode,
        eventType: AuditEventType.DELETED,
        changes: [],
      });
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
    actor?: AuditActor,
  ) {
    const product = await this.assertPoOpenForProduct(
      poId,
      productId,
      'gán tài liệu',
    );
    if (product.status === ProductStatus.CLOSED) {
      throw new BadRequestException(
        'Sản phẩm đã bị khóa, không thể gán tài liệu.',
      );
    }

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
    if (existing && (!targetPurpose || existing.purpose === targetPurpose)) {
      return existing;
    }

    const targetLabel = await this.documentAuditLabel(documentId);
    return this.dataSource.transaction(async (manager) => {
      if (existing && targetPurpose) {
        const oldPurpose = existing.purpose;
        existing.purpose = targetPurpose;
        const saved = await manager.save(
          PurchaseOrderProductDocument,
          existing,
        );
        await this.recordAudit(manager, actor, {
          aggregateType: AUDIT_TYPE.PRODUCT_DOCUMENT,
          aggregateId: documentId,
          parentId: productId,
          targetLabel,
          eventType: AuditEventType.UPDATED,
          changes: [
            {
              fieldName: 'purpose',
              oldValue: oldPurpose,
              newValue: targetPurpose,
            },
          ],
        });
        return saved;
      }

      const link = this.productDocRepo.create({
        productId,
        documentId,
        sourcePoDocument: true,
        purpose: purposeToUse,
        linkedBy: userId,
        linkedAt: new Date(),
      });
      const saved = await manager.save(PurchaseOrderProductDocument, link);
      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PRODUCT_DOCUMENT,
        aggregateId: documentId,
        parentId: productId,
        targetLabel,
        eventType: AuditEventType.CREATED,
        reason: 'Gán từ kho tài liệu PO',
        changes: [
          { fieldName: 'fileName', oldValue: null, newValue: targetLabel },
          { fieldName: 'purpose', oldValue: null, newValue: purposeToUse },
        ],
      });
      return saved;
    });
  }

  /**
   * Cập nhật mục đích sử dụng (Mục: PO Chi Tiết, TechPack, Khác) của tài liệu sản phẩm
   */
  async updateProductDocumentPurpose(
    poId: string,
    productId: string,
    documentId: string,
    purpose: DocumentPurpose,
    actor?: AuditActor,
  ) {
    const product = await this.assertPoOpenForProduct(
      poId,
      productId,
      'đổi phân loại tài liệu',
    );
    if (product.status === ProductStatus.CLOSED) {
      throw new BadRequestException(
        'Sản phẩm đã bị khóa, không thể đổi phân loại tài liệu.',
      );
    }
    const existing = await this.productDocRepo.findOne({
      where: { productId, documentId },
    });
    if (!existing) {
      throw new NotFoundException('Tài liệu chưa được gán vào sản phẩm này.');
    }
    const oldPurpose = existing.purpose;
    existing.purpose = purpose;
    const targetLabel = await this.documentAuditLabel(documentId);
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(PurchaseOrderProductDocument, existing);
      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PRODUCT_DOCUMENT,
        aggregateId: documentId,
        parentId: productId,
        targetLabel,
        eventType: AuditEventType.UPDATED,
        changes:
          oldPurpose === purpose
            ? []
            : [
                {
                  fieldName: 'purpose',
                  oldValue: oldPurpose,
                  newValue: purpose,
                },
              ],
      });
      return saved;
    });
  }

  /**
   * Gỡ liên kết tài liệu khỏi Product
   */
  async unlinkProductDocument(
    poId: string,
    productId: string,
    documentId: string,
    actor?: AuditActor,
  ): Promise<void> {
    const product = await this.assertPoOpenForProduct(
      poId,
      productId,
      'gỡ tài liệu',
    );
    if (product.status === ProductStatus.CLOSED) {
      throw new BadRequestException(
        'Sản phẩm đã bị khóa, không thể gỡ tài liệu.',
      );
    }
    const existing = await this.productDocRepo.findOne({
      where: { productId, documentId },
    });
    if (!existing) return;
    const targetLabel = await this.documentAuditLabel(documentId);
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(PurchaseOrderProductDocument, {
        productId,
        documentId,
      });
      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PRODUCT_DOCUMENT,
        aggregateId: documentId,
        parentId: productId,
        targetLabel,
        eventType: AuditEventType.DELETED,
        reason: `Gỡ tài liệu ${targetLabel}`,
        changes: [],
      });
    });
  }

  /**
   * Xin presigned URL để tải tài liệu lên cho Sản phẩm PO (S3 direct upload)
   */
  async presignProductDocument(
    poId: string,
    productId: string,
    dto: PresignPoDocumentDto,
  ): Promise<{ objectKey: string; uploadUrl: string; expiresIn: number }> {
    const product = await this.assertPoOpenForProduct(
      poId,
      productId,
      'tải lên tài liệu mới',
    );
    if (product.status === ProductStatus.CLOSED) {
      throw new BadRequestException(
        'Sản phẩm đã bị khóa, không thể tải lên tài liệu mới.',
      );
    }

    assertAllowedFile(dto.fileName, dto.mimeType, dto.sizeBytes, {
      allowlist: ALLOWED_PO_MIME_BY_EXTENSION,
      maxSizeBytes: PO_DOCUMENT_MAX_SIZE_BYTES,
    });

    const ext = path.extname(dto.fileName).toLowerCase();
    const objectKey = `purchase-orders/${poId}/products/${productId}/documents/${dto.purpose}/${randomUUID()}${ext}`;

    const uploadUrl = await this.storage.getPresignedPutUrl(
      objectKey,
      dto.mimeType,
      PRESIGN_PUT_EXPIRY_SECONDS,
    );

    return { objectKey, uploadUrl, expiresIn: PRESIGN_PUT_EXPIRY_SECONDS };
  }

  /**
   * Xác nhận đã tải lên xong (S3), ghi tài liệu mới vào Sản phẩm PO
   */
  async confirmProductDocument(
    poId: string,
    productId: string,
    userId: string | undefined,
    dto: ConfirmPoDocumentDto,
    actor?: AuditActor,
  ): Promise<{
    productId: string;
    documentId: string;
    documentCode: string | null;
    title: string;
    purpose: string;
    linkedAt: Date;
    fileUrl: string;
    fileName: string;
    fileSize: number;
  }> {
    const product = await this.assertPoOpenForProduct(
      poId,
      productId,
      'tải lên tài liệu mới',
    );
    if (product.status === ProductStatus.CLOSED) {
      throw new BadRequestException(
        'Sản phẩm đã bị khóa, không thể tải lên tài liệu mới.',
      );
    }

    this.assertObjectKeyInScope(
      dto.objectKey,
      `purchase-orders/${poId}/products/${productId}/documents/`,
    );

    const head = await this.storage.headObject(dto.objectKey);
    if (!head.exists) {
      throw new BadRequestException(
        'Tệp chưa được tải lên thành công, vui lòng thử upload lại.',
      );
    }

    // Server never receives the raw upload (client PUTs straight to S3 with a
    // presigned URL), so the magic-bytes check that used to run on the multer
    // buffer must run here instead, against the bytes actually stored on S3.
    const ext = (path.extname(dto.fileName) || '').toLowerCase();
    const buffer = await this.readBytesForMagicCheck(dto.objectKey, ext);
    this.validateFileMagicBytes(ext, buffer);

    const now = new Date();

    return this.dataSource
      .transaction(async (manager) => {
        const docRepo = manager.getRepository(Document);
        const versionRepo = manager.getRepository(DocumentVersion);
        const productDocRepo = manager.getRepository(
          PurchaseOrderProductDocument,
        );

        const doc = await docRepo.save(
          docRepo.create({
            documentCode: `DOC-PROD-${Date.now().toString().slice(-6)}`,
            title: dto.fileName,
            createdBy: userId || (null as any),
            createdAt: now,
          }),
        );

        const version = await versionRepo.save(
          versionRepo.create({
            documentId: doc.id,
            versionNo: 1,
            originalFileName: dto.fileName,
            storageKey: dto.objectKey,
            mimeType: dto.mimeType,
            byteSize: dto.sizeBytes,
            status: UploadStatus.READY,
            uploadedBy: userId || (null as any),
            uploadedAt: now,
          }),
        );

        doc.currentVersionId = version.id;
        await docRepo.save(doc);

        await productDocRepo.save(
          productDocRepo.create({
            productId,
            documentId: doc.id,
            sourcePoDocument: false,
            purpose: dto.purpose,
            linkedBy: userId || (null as any),
            linkedAt: now,
          }),
        );

        await this.recordAudit(manager, actor, {
          aggregateType: AUDIT_TYPE.PRODUCT_DOCUMENT,
          aggregateId: doc.id,
          parentId: productId,
          targetLabel: dto.fileName,
          eventType: AuditEventType.CREATED,
          changes: [
            { fieldName: 'fileName', oldValue: null, newValue: dto.fileName },
            { fieldName: 'purpose', oldValue: null, newValue: dto.purpose },
          ],
        });

        return {
          productId,
          documentId: doc.id,
          documentCode: doc.documentCode,
          title: doc.title,
          purpose: String(dto.purpose),
          linkedAt: now,
          fileUrl: await this.storage.getPresignedGetUrl(
            dto.objectKey,
            PRESIGN_GET_EXPIRY_SECONDS,
          ),
          fileName: dto.fileName,
          fileSize: dto.sizeBytes,
        };
      })
      .catch((e) => this.rethrowDuplicateStorageKey(e));
  }

  /**
   * Xác nhận đã tải lên xong (S3), thêm phiên bản mới cho tài liệu của Sản phẩm PO
   */
  async confirmProductDocumentVersion(
    poId: string,
    productId: string,
    documentId: string,
    userId: string | undefined,
    dto: ConfirmPoDocumentVersionDto,
    actor?: AuditActor,
  ) {
    const product = await this.assertPoOpenForProduct(
      poId,
      productId,
      'cập nhật phiên bản tài liệu',
    );
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

    return this.appendDocumentVersion(
      documentId,
      userId,
      dto,
      `purchase-orders/${poId}/products/${productId}/documents/`,
      AUDIT_TYPE.PRODUCT_DOCUMENT,
      productId,
      String(prodDoc.purpose),
      actor,
      {
        sourcePoDocument: prodDoc.sourcePoDocument,
        linkedAt: prodDoc.linkedAt,
      },
    );
  }

  async confirmPoDocumentVersion(
    poId: string,
    documentId: string,
    userId: string | undefined,
    dto: ConfirmPoDocumentVersionDto,
    actor?: AuditActor,
  ) {
    const po = await this.poRepo.findOne({ where: { id: poId } });
    if (!po) throw new NotFoundException('Không tìm thấy đơn hàng PO.');
    this.checkPoNotLocked(po, 'cập nhật phiên bản tài liệu');

    const poDoc = await this.poDocRepo.findOne({
      where: { purchaseOrderId: poId, documentId },
    });
    if (!poDoc) throw new NotFoundException('Tài liệu không thuộc PO này.');

    return this.appendDocumentVersion(
      documentId,
      userId,
      dto,
      `purchase-orders/${poId}/documents/`,
      AUDIT_TYPE.PO_DOCUMENT,
      poId,
      String(poDoc.purpose),
      actor,
      { linkedAt: poDoc.linkedAt },
    );
  }

  private async appendDocumentVersion(
    documentId: string,
    userId: string | undefined,
    dto: ConfirmPoDocumentVersionDto,
    objectKeyPrefix: string,
    auditType: string,
    parentId: string,
    purpose: string,
    actor?: AuditActor,
    linkMetadata?: { sourcePoDocument?: boolean; linkedAt?: Date },
  ) {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) {
      throw new NotFoundException('Không tìm thấy tài liệu.');
    }

    if (dto.purpose !== purpose) {
      throw new BadRequestException('Phân loại tệp không khớp với tài liệu.');
    }
    const uploadPrefix = `${objectKeyPrefix}${purpose}/`;
    this.assertObjectKeyInScope(dto.objectKey, uploadPrefix);

    const changeReason = dto.changeReason?.trim();
    if (!changeReason) {
      throw new BadRequestException('Vui lòng nhập lý do thay đổi phiên bản.');
    }
    assertAllowedFile(dto.fileName, dto.mimeType, dto.sizeBytes, {
      allowlist: ALLOWED_PO_MIME_BY_EXTENSION,
      maxSizeBytes: PO_DOCUMENT_MAX_SIZE_BYTES,
    });

    const evidenceFields = [
      dto.evidenceObjectKey,
      dto.evidenceFileName,
      dto.evidenceMimeType,
    ];
    if (evidenceFields.some(Boolean) && !evidenceFields.every(Boolean)) {
      throw new BadRequestException('Thông tin ảnh bằng chứng chưa đầy đủ.');
    }
    const ext = (path.extname(dto.fileName) || '').toLowerCase();
    const evidenceExt = dto.evidenceFileName
      ? path.extname(dto.evidenceFileName).toLowerCase()
      : null;
    // Both uploads have completed before confirm is called. Validate their S3
    // metadata and file signatures concurrently so evidence does not add two
    // extra network round trips to the version file's confirmation time.
    const [head, buffer, evidenceHead, evidenceBuffer] = await Promise.all([
      this.storage.headObject(dto.objectKey),
      this.readBytesForMagicCheck(dto.objectKey, ext),
      dto.evidenceObjectKey
        ? this.storage.headObject(dto.evidenceObjectKey)
        : Promise.resolve(null),
      dto.evidenceObjectKey && evidenceExt
        ? this.readBytesForMagicCheck(dto.evidenceObjectKey, evidenceExt)
        : Promise.resolve(null),
    ]);

    if (dto.evidenceObjectKey && dto.evidenceFileName && dto.evidenceMimeType) {
      if (!evidenceHead?.exists || !evidenceBuffer || !evidenceExt) {
        throw new BadRequestException(
          'Ảnh bằng chứng chưa được tải lên thành công.',
        );
      }
      assertAllowedFile(
        dto.evidenceFileName,
        dto.evidenceMimeType,
        evidenceHead.sizeBytes || 1,
        {
          allowlist: SAMPLE_IMAGE_ALLOWLIST,
          maxSizeBytes: MAX_SAMPLE_IMAGE_SIZE_BYTES,
        },
      );
      this.validateFileMagicBytes(evidenceExt, evidenceBuffer);
    }

    if (!head.exists) {
      throw new BadRequestException(
        'Tệp chưa được tải lên thành công, vui lòng thử upload lại.',
      );
    }
    if (head.sizeBytes !== undefined && head.sizeBytes !== dto.sizeBytes) {
      throw new BadRequestException(
        'Dung lượng tệp phiên bản không khớp với tệp đã tải lên.',
      );
    }
    this.validateFileMagicBytes(ext, buffer);

    const now = new Date();

    return this.dataSource
      .transaction(async (manager) => {
        // PO and Product can both update this shared Document. Lock the same
        // row before reading versions so concurrent confirms get unique numbers.
        await manager.findOne(Document, {
          where: { id: documentId },
          lock: { mode: 'pessimistic_write' },
        });
        const existingVersions = await manager.find(DocumentVersion, {
          where: { documentId },
          order: { versionNo: 'DESC' },
        });
        const nextVersionNo = (existingVersions[0]?.versionNo || 0) + 1;
        const docRepo = manager.getRepository(Document);
        const versionRepo = manager.getRepository(DocumentVersion);

        const newVersion = await versionRepo.save(
          versionRepo.create({
            documentId,
            versionNo: nextVersionNo,
            originalFileName: dto.fileName,
            storageKey: dto.objectKey,
            mimeType: dto.mimeType,
            byteSize: dto.sizeBytes,
            changeReason,
            evidenceStorageKey: dto.evidenceObjectKey || null,
            evidenceFileName: dto.evidenceFileName || null,
            evidenceMimeType: dto.evidenceMimeType || null,
            status: UploadStatus.READY,
            uploadedBy: userId || (null as any),
            uploadedAt: now,
          }),
        );

        doc.currentVersionId = newVersion.id;
        await docRepo.save(doc);

        const previous = existingVersions[0];
        await this.recordAudit(manager, actor, {
          aggregateType: auditType,
          aggregateId: documentId,
          parentId,
          targetLabel: doc.title,
          eventType: AuditEventType.UPDATED,
          reason: `Tải lên phiên bản ${nextVersionNo}: ${changeReason}`,
          changes: [
            {
              fieldName: 'version',
              oldValue: previous
                ? `v${previous.versionNo} · ${previous.originalFileName}`
                : null,
              newValue: `v${nextVersionNo} · ${dto.fileName}`,
            },
          ],
        });

        const allVersions = [newVersion, ...existingVersions];

        return {
          productId:
            auditType === AUDIT_TYPE.PRODUCT_DOCUMENT ? parentId : null,
          documentId,
          documentCode: doc.documentCode,
          title: doc.title,
          purpose,
          ...linkMetadata,
          fileName: dto.fileName,
          fileUrl: await this.storage.getPresignedGetUrl(
            dto.objectKey,
            PRESIGN_GET_EXPIRY_SECONDS,
          ),
          fileSize: dto.sizeBytes,
          currentVersionNo: nextVersionNo,
          versions: await Promise.all(
            allVersions.map(async (v) => ({
              id: v.id,
              versionNo: v.versionNo,
              originalFileName: v.originalFileName,
              fileUrl: isResolvableObjectKey(v.storageKey)
                ? await this.storage.getPresignedGetUrl(v.storageKey)
                : null,
              fileSize: v.byteSize ? Number(v.byteSize) : null,
              mimeType: v.mimeType,
              changeReason: v.changeReason,
              evidenceFileName: v.evidenceFileName,
              evidenceUrl: v.evidenceStorageKey
                ? await this.storage.getPresignedGetUrl(v.evidenceStorageKey)
                : null,
              uploadedAt: v.uploadedAt,
              uploadedBy: v.uploadedBy,
            })),
          ),
        };
      })
      .catch((e) => this.rethrowDuplicateStorageKey(e));
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
    poId: string,
    productId: string,
    dto: SaveProductOperationStepsDto,
    actor?: AuditActor,
  ) {
    const product = await this.assertPoOpenForProduct(
      poId,
      productId,
      'chỉnh sửa bảng quy trình công đoạn',
    );

    if (product.status === ProductStatus.CLOSED) {
      throw new BadRequestException(
        'Sản phẩm đang ở trạng thái Khóa. Không thể chỉnh sửa bảng quy trình công đoạn.',
      );
    }

    return await this.dataSource.transaction(async (manager) => {
      const beforeSteps = await manager.find(
        PurchaseOrderProductOperationStep,
        { where: { productId } },
      );

      // Xóa các bước cũ
      await manager.delete(PurchaseOrderProductOperationStep, { productId });

      // Tạo các bước mới
      // NOTE: order_index has a UNIQUE(product_id, order_index) DB constraint,
      // so it must be assigned from the submitted array position (idx), which
      // is always unique 0..n-1. Trusting a client-supplied step.orderIndex
      // instead (as before) breaks as soon as nested/grouped steps re-use the
      // same index per-group (e.g. every group's children numbered 0,1,2...),
      // causing a duplicate-key 500 on save (uq_product_step_order).
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
        entity.orderIndex = idx;
        entity.isGroup = Boolean(step.isGroup);
        return entity;
      });

      const savedSteps = await manager.save(
        PurchaseOrderProductOperationStep,
        newSteps,
      );

      const oldCmBaseDays = product.as3bCmBaseDays;
      // NOTE: use `!= null` (not truthy) so an explicit cmBaseDays of 0 is
      // still persisted instead of being silently skipped.
      if (dto.cmBaseDays != null) {
        product.as3bCmBaseDays = Number(dto.cmBaseDays);
        await manager.save(PurchaseOrderProduct, product);
      }

      const extraChanges: EntityFieldChange[] =
        dto.cmBaseDays != null &&
        Number(oldCmBaseDays) !== Number(dto.cmBaseDays)
          ? [
              {
                fieldName: 'as3bCmBaseDays',
                oldValue: oldCmBaseDays ?? null,
                newValue: Number(dto.cmBaseDays),
              },
            ]
          : [];
      await this.recordStepsAudit(
        manager,
        actor,
        productId,
        beforeSteps,
        newSteps,
        extraChanges,
      );

      return savedSteps;
    });
  }

  /** 1 lần bấm Lưu bảng công đoạn = 1 sự kiện, giống bên Mẫu Fit: field-name
   * mang tiền tố "<tên công đoạn>::" để FE nhóm theo dòng, phần tóm tắt chỉ
   * ghi số lượng. Công đoạn cũ/mới được ghép theo id. */
  private async recordStepsAudit(
    manager: EntityManager,
    actor: AuditActor | undefined,
    productId: string,
    beforeSteps: PurchaseOrderProductOperationStep[],
    afterSteps: PurchaseOrderProductOperationStep[],
    extraChanges: EntityFieldChange[],
  ): Promise<void> {
    if (!actor) return;
    const beforeById = new Map(beforeSteps.map((s) => [s.id, s]));
    const afterIds = new Set(afterSteps.map((s) => s.id));
    const stepNameById = new Map(
      [...beforeSteps, ...afterSteps].map((s) => [s.id, s.stepName]),
    );
    const rowLabel = (step: PurchaseOrderProductOperationStep) =>
      step.stepName || '(không tên)';

    let created = 0;
    let updated = 0;
    const changes: EntityFieldChange[] = [...extraChanges];
    for (const after of afterSteps) {
      const before = beforeById.get(after.id) ?? null;
      // Dòng mới: bỏ các giá trị mặc định (0, false, thứ tự) cho gọn.
      const fields = auditDiff(before, after, STEP_AUDIT_FIELDS).filter(
        (field) =>
          before ||
          (field.fieldName !== 'orderIndex' &&
            field.newValue !== 0 &&
            field.newValue !== false),
      );
      if (!before) created++;
      else if (fields.length > 0) updated++;
      for (const field of fields) {
        const resolve = (value: unknown) =>
          field.fieldName === 'parentStepId' && typeof value === 'string'
            ? (stepNameById.get(value) ?? value)
            : value;
        changes.push({
          fieldName: `${rowLabel(after)}::${field.fieldName}`,
          oldValue: resolve(field.oldValue),
          newValue: resolve(field.newValue),
        });
      }
    }
    const deleted = beforeSteps.filter((s) => !afterIds.has(s.id)).length;

    const reasonParts: string[] = [];
    if (created > 0) reasonParts.push(`Tạo mới ${created} công đoạn`);
    if (updated > 0) reasonParts.push(`Cập nhật ${updated} công đoạn`);
    if (deleted > 0) reasonParts.push(`Xoá ${deleted} công đoạn`);
    if (reasonParts.length === 0 && extraChanges.length === 0) return;

    const eventType =
      created > 0 && updated === 0 && deleted === 0 && !extraChanges.length
        ? AuditEventType.CREATED
        : deleted > 0 && created === 0 && updated === 0 && !extraChanges.length
          ? AuditEventType.DELETED
          : AuditEventType.UPDATED;
    await this.recordAudit(manager, actor, {
      aggregateType: AUDIT_TYPE.PRODUCT_STEPS,
      aggregateId: productId,
      parentId: productId,
      targetLabel: 'Quy trình công đoạn',
      eventType,
      reason: reasonParts.join('; ') || undefined,
      changes,
    });
  }

  /**
   * Quản lý đợt mẫu riêng của Product
   */
  private async assertPoProductExists(
    poId: string,
    productId: string,
  ): Promise<PurchaseOrderProduct> {
    const product = await this.productRepo.findOne({
      where: { id: productId, purchaseOrderId: poId },
    });
    if (!product) {
      throw new NotFoundException(
        `Không tìm thấy sản phẩm #${productId} trong đơn hàng PO`,
      );
    }
    return product;
  }

  /**
   * Như assertPoProductExists, nhưng còn chặn khi sản phẩm đã Khóa — dùng cho
   * các thao tác ghi (sửa/upload/xoá đợt may mẫu). Endpoint chỉ-đọc (vd. lấy
   * link tải ảnh) vẫn dùng assertPoProductExists thẳng, không qua hàm này,
   * vì sản phẩm khóa vẫn được phép xem/tải về theo đúng banner cảnh báo bên FE.
   */
  /** PO đã khóa/hủy thì mọi dữ liệu sản phẩm bên trong cũng đóng băng. Kiểm
   * tra theo PO thật của sản phẩm, không tin riêng :id trên URL. */
  private async assertPoOpenForProduct(
    poId: string,
    productId: string,
    action: string,
  ): Promise<PurchaseOrderProduct> {
    const [product, po] = await Promise.all([
      this.productRepo.findOne({
        where: { id: productId, purchaseOrderId: poId },
      }),
      this.poRepo.findOne({ where: { id: poId } }),
    ]);
    if (!product || !po) {
      throw new NotFoundException(
        `Không tìm thấy sản phẩm #${productId} trong đơn hàng PO`,
      );
    }
    this.checkPoNotLocked(po, action);
    return product;
  }

  private async assertPoProductEditable(
    poId: string,
    productId: string,
  ): Promise<PurchaseOrderProduct> {
    const product = await this.assertPoOpenForProduct(
      poId,
      productId,
      'chỉnh sửa đợt may mẫu',
    );
    if (product.status === ProductStatus.CLOSED) {
      throw new BadRequestException(
        'Sản phẩm đã bị khóa, không thể chỉnh sửa đợt may mẫu.',
      );
    }
    return product;
  }

  private async findProductSampleRoundOrThrow(
    productId: string,
    roundId: string,
  ): Promise<PurchaseOrderProductSampleRound> {
    const round = await this.productSampleRoundRepo.findOne({
      where: { id: roundId, productId },
    });
    if (!round) {
      throw new NotFoundException(`Không tìm thấy đợt may mẫu #${roundId}`);
    }
    return round;
  }

  private async mapProductSampleImages(
    roundIds: string[],
  ): Promise<Map<string, any[]>> {
    const map = new Map<string, any[]>();
    if (roundIds.length === 0) return map;

    const rows = await this.productSampleImageRepo
      .createQueryBuilder('img')
      .innerJoin(DocumentVersion, 'v', 'v.id = img.documentVersionId')
      .where('img.sampleRoundId IN (:...roundIds)', { roundIds })
      .select('img.id', 'id')
      .addSelect('img.sampleRoundId', 'sampleRoundId')
      .addSelect('img.orderIndex', 'orderIndex')
      .addSelect('img.colorNameSnapshot', 'colorName')
      .addSelect('v.storageKey', 'storageKey')
      .addSelect('v.originalFileName', 'fileName')
      .addSelect('v.mimeType', 'mimeType')
      .addSelect('v.uploadedAt', 'uploadedAt')
      .orderBy('img.orderIndex', 'ASC')
      .getRawMany<{
        id: string;
        sampleRoundId: string;
        orderIndex: number;
        colorName: string | null;
        storageKey: string;
        fileName: string;
        mimeType: string;
        uploadedAt: Date;
      }>();

    const withUrls = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        url: await this.storage.getPresignedGetUrl(
          row.storageKey,
          PRESIGN_GET_EXPIRY_SECONDS,
        ),
      })),
    );

    for (const row of withUrls) {
      const list = map.get(row.sampleRoundId) || [];
      list.push({
        id: row.id,
        url: row.url,
        fileName: row.fileName,
        mimeType: row.mimeType,
        orderIndex: row.orderIndex,
        colorName: row.colorName,
        uploadedAt: row.uploadedAt,
      });
      map.set(row.sampleRoundId, list);
    }
    return map;
  }

  private toProductSampleRoundItem(
    round: PurchaseOrderProductSampleRound,
    images: any[],
  ) {
    return {
      id: round.id,
      roundNo: round.roundNo,
      sampleDate: round.sampleDate,
      feedback: round.feedback,
      status: round.status,
      createdBy: round.createdBy,
      createdAt: round.createdAt,
      reviewedBy: round.reviewedBy,
      reviewedAt: round.reviewedAt,
      images,
    };
  }

  async getProductSampleRounds(productId: string) {
    const rounds = await this.productSampleRoundRepo.find({
      where: { productId },
      order: { roundNo: 'ASC' },
    });
    if (rounds.length === 0) return [];

    const imagesMap = await this.mapProductSampleImages(
      rounds.map((r) => r.id),
    );
    return rounds.map((r) =>
      this.toProductSampleRoundItem(r, imagesMap.get(r.id) || []),
    );
  }

  async createProductSampleRound(
    poId: string,
    productId: string,
    dto: CreateProductSampleRoundDto,
    userId?: string,
    actor?: AuditActor,
  ) {
    const product = await this.assertPoOpenForProduct(
      poId,
      productId,
      'chỉnh sửa đợt may mẫu',
    );
    if (product.status === ProductStatus.CLOSED) {
      throw new BadRequestException(
        'Sản phẩm đã bị khóa, không thể chỉnh sửa đợt may mẫu.',
      );
    }

    const savedRound = await this.dataSource.transaction(async (manager) => {
      // Giống bên Mẫu Fit: 2 request cùng lúc (bấm đúp) đọc cùng count rồi
      // cùng insert roundNo đó → đụng uq_product_sample_round. Khoá dòng sản
      // phẩm để các request của cùng 1 sản phẩm chạy tuần tự.
      await manager.findOne(PurchaseOrderProduct, {
        where: { id: productId },
        lock: { mode: 'pessimistic_write' },
      });
      const roundRepo = manager.getRepository(PurchaseOrderProductSampleRound);
      const imageRepo = manager.getRepository(PurchaseOrderProductSampleImage);

      const currentCount = await roundRepo.count({ where: { productId } });
      const roundNo = currentCount + 1;

      const round = roundRepo.create({
        productId,
        roundNo,
        sampleDate: dto.sampleDate ? new Date(dto.sampleDate) : new Date(),
        feedback: dto.feedback || '',
        status: (dto.status as SampleStatus) || SampleStatus.WORKING,
        createdBy: userId,
        createdAt: new Date(),
      });
      const saved = await roundRepo.save(round);

      // NOTE: dto.images used to be accepted by the DTO but silently dropped
      // here — the round was created with no attached images at all, even
      // when the client sent a fully-populated ordered image list.
      const imagesToCreate = (dto.images || []).filter(
        (img) => !!img.documentVersionId,
      );
      if (imagesToCreate.length > 0) {
        const imageEntities = imagesToCreate.map((img, idx) =>
          imageRepo.create({
            sampleRoundId: saved.id,
            documentVersionId: img.documentVersionId as string,
            colorNameSnapshot: img.colorName || undefined,
            orderIndex: idx,
          }),
        );
        await imageRepo.save(imageEntities);
      }

      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PRODUCT_SAMPLE_ROUND,
        aggregateId: saved.id,
        parentId: productId,
        targetLabel: `Đợt may mẫu #${saved.roundNo}`,
        eventType: AuditEventType.CREATED,
        changes: auditDiff(null, saved, SAMPLE_ROUND_AUDIT_FIELDS),
      });

      return saved;
    });

    const imagesMap = await this.mapProductSampleImages([savedRound.id]);
    return this.toProductSampleRoundItem(
      savedRound,
      imagesMap.get(savedRound.id) || [],
    );
  }

  async updateProductSampleRound(
    poId: string,
    productId: string,
    roundId: string,
    dto: UpdateProductSampleRoundDto,
    userId?: string,
    actor?: AuditActor,
  ) {
    await this.assertPoProductEditable(poId, productId);
    const round = await this.findProductSampleRoundOrThrow(productId, roundId);
    const before = { ...round };

    if (dto.sampleDate !== undefined) {
      round.sampleDate = new Date(dto.sampleDate);
    }
    if (dto.feedback !== undefined) {
      round.feedback = dto.feedback;
    }
    if (dto.status !== undefined && dto.status !== round.status) {
      round.status = dto.status;
      if (dto.status === SampleStatus.WORKING) {
        round.reviewedBy = null as unknown as string;
        round.reviewedAt = null as unknown as Date;
      } else {
        round.reviewedBy = (userId ?? null) as unknown as string;
        round.reviewedAt = new Date();
      }
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const savedRound = await manager
        .getRepository(PurchaseOrderProductSampleRound)
        .save(round);
      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PRODUCT_SAMPLE_ROUND,
        aggregateId: roundId,
        parentId: productId,
        targetLabel: `Đợt may mẫu #${round.roundNo}`,
        eventType: AuditEventType.UPDATED,
        changes: auditDiff(before, round, SAMPLE_ROUND_AUDIT_FIELDS),
      });
      return savedRound;
    });
    const imagesMap = await this.mapProductSampleImages([roundId]);
    return this.toProductSampleRoundItem(saved, imagesMap.get(roundId) || []);
  }

  async presignProductSampleImage(
    poId: string,
    productId: string,
    roundId: string,
    dto: PresignProductSampleImageDto,
  ): Promise<{ objectKey: string; uploadUrl: string; expiresIn: number }> {
    await this.assertPoProductEditable(poId, productId);
    await this.findProductSampleRoundOrThrow(productId, roundId);
    assertAllowedFile(dto.fileName, dto.mimeType, dto.sizeBytes, {
      allowlist: SAMPLE_IMAGE_ALLOWLIST,
      maxSizeBytes: MAX_SAMPLE_IMAGE_SIZE_BYTES,
    });

    const ext = path.extname(dto.fileName).toLowerCase();
    const objectKey = `purchase-orders/${poId}/products/${productId}/sample-rounds/${roundId}/images/${randomUUID()}${ext}`;

    const uploadUrl = await this.storage.getPresignedPutUrl(
      objectKey,
      dto.mimeType,
      PRESIGN_PUT_EXPIRY_SECONDS,
    );

    return { objectKey, uploadUrl, expiresIn: PRESIGN_PUT_EXPIRY_SECONDS };
  }

  async confirmProductSampleImage(
    poId: string,
    productId: string,
    roundId: string,
    userId: string | undefined,
    dto: ConfirmProductSampleImageDto,
    actor?: AuditActor,
  ) {
    await this.assertPoProductEditable(poId, productId);
    const round = await this.findProductSampleRoundOrThrow(productId, roundId);

    if (
      !isObjectKeyInScope(
        dto.objectKey,
        `purchase-orders/${poId}/products/${productId}/sample-rounds/${roundId}/images/`,
      )
    ) {
      throw new BadRequestException(
        'objectKey không thuộc phạm vi tải lên này, vui lòng lấy lại link upload.',
      );
    }

    const head = await this.storage.headObject(dto.objectKey);
    if (!head.exists) {
      throw new BadRequestException(
        'Ảnh chưa được tải lên thành công, vui lòng thử upload lại.',
      );
    }
    if (head.sizeBytes && head.sizeBytes > MAX_SAMPLE_IMAGE_SIZE_BYTES) {
      await this.storage.deleteObject(dto.objectKey);
      throw new BadRequestException(
        `Dung lượng ảnh vượt quá giới hạn ${(MAX_SAMPLE_IMAGE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB.`,
      );
    }

    const now = new Date();

    return this.dataSource
      .transaction(async (manager) => {
        const docRepo = manager.getRepository(Document);
        const versionRepo = manager.getRepository(DocumentVersion);
        const imageRepo = manager.getRepository(
          PurchaseOrderProductSampleImage,
        );

        const doc = await docRepo.save(
          docRepo.create({
            title: dto.fileName,
            createdBy: userId || (null as any),
            createdAt: now,
          }),
        );

        const version = await versionRepo.save(
          versionRepo.create({
            documentId: doc.id,
            versionNo: 1,
            originalFileName: dto.fileName,
            storageKey: dto.objectKey,
            mimeType: dto.mimeType,
            byteSize: dto.sizeBytes,
            status: UploadStatus.READY,
            uploadedBy: userId || (null as any),
            uploadedAt: now,
          }),
        );

        doc.currentVersionId = version.id;
        await docRepo.save(doc);

        const orderIndex = await imageRepo.count({
          where: { sampleRoundId: roundId },
        });
        const image = await imageRepo.save(
          imageRepo.create({
            sampleRoundId: roundId,
            documentVersionId: version.id,
            orderIndex,
          }),
        );

        await this.recordAudit(manager, actor, {
          aggregateType: AUDIT_TYPE.PRODUCT_SAMPLE_ROUND,
          aggregateId: roundId,
          parentId: productId,
          targetLabel: `Đợt may mẫu #${round.roundNo}`,
          eventType: AuditEventType.DOCUMENT_VERSION_ADDED,
          changes: [
            { fieldName: 'images', oldValue: null, newValue: dto.fileName },
          ],
        });

        const url = await this.storage.getPresignedGetUrl(
          dto.objectKey,
          PRESIGN_GET_EXPIRY_SECONDS,
        );

        return {
          id: image.id,
          url,
          fileName: dto.fileName,
          mimeType: dto.mimeType,
          orderIndex,
          colorName: null as string | null,
          uploadedAt: now,
        };
      })
      .catch((error) => {
        if (isDuplicateStorageKeyError(error)) {
          throw new BadRequestException(
            'Ảnh này đã được đính kèm trong hệ thống, không thể đính kèm lại.',
          );
        }
        throw error;
      });
  }

  async getProductSampleImageDownloadUrl(
    poId: string,
    productId: string,
    roundId: string,
    imageId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    await this.assertPoProductExists(poId, productId);
    await this.findProductSampleRoundOrThrow(productId, roundId);

    const row = await this.productSampleImageRepo
      .createQueryBuilder('img')
      .innerJoin(DocumentVersion, 'v', 'v.id = img.documentVersionId')
      .where('img.id = :imageId', { imageId })
      .andWhere('img.sampleRoundId = :roundId', { roundId })
      .select('v.storageKey', 'storageKey')
      .addSelect('v.originalFileName', 'fileName')
      .getRawOne<{ storageKey: string; fileName: string }>();

    if (!row) {
      throw new NotFoundException(`Không tìm thấy ảnh #${imageId}`);
    }

    const url = await this.storage.getPresignedGetUrl(
      row.storageKey,
      PRESIGN_GET_EXPIRY_SECONDS,
      row.fileName,
    );

    return { url, expiresIn: PRESIGN_GET_EXPIRY_SECONDS };
  }

  async removeProductSampleImage(
    poId: string,
    productId: string,
    roundId: string,
    imageId: string,
    actor?: AuditActor,
  ): Promise<void> {
    await this.assertPoProductEditable(poId, productId);
    const round = await this.findProductSampleRoundOrThrow(productId, roundId);

    const image = await this.productSampleImageRepo.findOne({
      where: { id: imageId, sampleRoundId: roundId },
    });
    if (!image) {
      throw new NotFoundException(`Không tìm thấy ảnh #${imageId}`);
    }
    const version = await this.docVersionRepo.findOne({
      where: { id: image.documentVersionId },
    });
    const fileName = version?.originalFileName ?? 'ảnh';

    await this.dataSource.transaction(async (manager) => {
      await manager.remove(PurchaseOrderProductSampleImage, image);
      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PRODUCT_SAMPLE_ROUND,
        aggregateId: roundId,
        parentId: productId,
        targetLabel: `Đợt may mẫu #${round.roundNo}`,
        eventType: AuditEventType.DELETED,
        reason: `Xoá ảnh ${fileName}`,
        changes: [{ fieldName: 'images', oldValue: fileName, newValue: null }],
      });
    });
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

    // DB chỉ giữ object key (xem toStoredImageRef) — ký lại mỗi lần đọc,
    // không thì FE nhận key trần và ảnh không hiển thị.
    const sizeData = Array.isArray(doc.sizeData)
      ? await Promise.all(
          (doc.sizeData as any[]).map(async (item) =>
            item &&
            typeof item === 'object' &&
            typeof item.imageUrl === 'string'
              ? { ...item, imageUrl: await this.resolveImageRef(item.imageUrl) }
              : item,
          ),
        )
      : doc.sizeData;

    const resolvedSections = await Promise.all(
      sections.map(async (s) => ({
        id: s.id,
        sectionCode: s.sectionCode,
        title: s.title,
        content: s.content,
        imageGroups: await Promise.all(
          (s.imageGroups ?? []).map(async (group: any) => ({
            ...group,
            imageUrls: await Promise.all(
              (group?.imageUrls ?? []).map((url: string) =>
                this.resolveImageRef(url),
              ),
            ),
          })),
        ),
        orderIndex: s.orderIndex,
        isFixed: s.isFixed,
      })),
    );

    // Liệt kê tường minh: FE spread lại sections/sizeRows vào payload lưu,
    // cột nội bộ (productionDocumentId, rowVersion...) sẽ bị DTO từ chối.
    return {
      id: doc.id,
      productId: doc.productId,
      styleId: doc.styleId,
      name: doc.name,
      description: doc.description,
      status: doc.status,
      section1Description: doc.section1Description,
      section1ImageUrl: await this.resolveImageRef(doc.section1ImageUrl),
      section2Accessories: doc.section2Accessories,
      section3Notes: doc.section3Notes,
      section4CustomerFeedback: doc.section4CustomerFeedback,
      sizeData,
      sourceDocumentId: doc.sourceDocumentId,
      copiedFromStyleId: doc.copiedFromStyleId,
      copiedAt: doc.copiedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      sections: resolvedSections,
      sizeRows: sizeRows.map((sr) => ({
        id: sr.id,
        sizeLabel: sr.sizeLabel,
        measurementName: sr.measurementName,
        measurementValue: sr.measurementValue,
        tolerance: sr.tolerance,
        orderIndex: sr.orderIndex,
      })),
    };
  }

  async updateProductProductionDoc(
    poId: string,
    productId: string,
    dto: UpdateStyleProductionDocDto,
    userId?: string,
    actor?: AuditActor,
  ) {
    const product = await this.assertPoOpenForProduct(
      poId,
      productId,
      'chỉnh sửa tài liệu sản xuất',
    );
    if (product.status === ProductStatus.CLOSED) {
      throw new BadRequestException(
        'Sản phẩm đã bị khóa, không thể chỉnh sửa tài liệu sản xuất.',
      );
    }
    const existingDoc = await this.prodDocRepo.findOne({
      where: { productId },
    });

    await this.dataSource.transaction(async (manager) => {
      const docRepo = manager.getRepository(ProductionDocument);
      const sectionRepo = manager.getRepository(ProductionDocumentSection);
      const sizeRowRepo = manager.getRepository(ProductionDocumentSizeRow);

      let doc = existingDoc;
      if (!doc) {
        doc = await docRepo.save(
          docRepo.create({
            productId,
            styleId: null,
            name: dto.name || `Tài liệu SX - ${product.productCode || 'SP'}`,
            status: dto.status || ProductionDocStatus.DRAFT,
            createdBy: userId,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        );
      }
      const before = existingDoc
        ? this.productionDocAuditSnapshot({ ...existingDoc })
        : null;

      if (dto.name !== undefined) doc.name = dto.name.trim();
      if (dto.description !== undefined)
        doc.description = dto.description ? dto.description.trim() : null;
      if (dto.status !== undefined) doc.status = dto.status;
      if (dto.section1Description !== undefined)
        doc.section1Description = dto.section1Description;
      if (dto.section1ImageUrl !== undefined)
        doc.section1ImageUrl = this.toStoredImageRef(dto.section1ImageUrl);
      if (dto.section2Accessories !== undefined)
        doc.section2Accessories = dto.section2Accessories;
      if (dto.section3Notes !== undefined)
        doc.section3Notes = dto.section3Notes;
      if (dto.section4CustomerFeedback !== undefined)
        doc.section4CustomerFeedback = dto.section4CustomerFeedback;
      if (dto.sizeData !== undefined)
        doc.sizeData = this.toStoredSizeData(dto.sizeData) as any;

      doc.updatedBy = userId || (null as any);
      doc.updatedAt = new Date();

      await docRepo.save(doc);
      const docId = doc.id;
      const extraChanges: EntityFieldChange[] = [];

      // Lưu sections (dynamic sections 06+)
      if (dto.sections !== undefined) {
        const existingSections = await sectionRepo.find({
          where: { productionDocumentId: docId },
        });
        const nonFixed = existingSections.filter((s) => !s.isFixed);
        if (nonFixed.length > 0) {
          await sectionRepo.remove(nonFixed);
        }

        let dynamicOrder = 5;
        const newSections = (dto.sections || [])
          .filter((s) => !s.isFixed)
          .map((s) =>
            sectionRepo.create({
              productionDocumentId: docId,
              sectionCode: s.sectionCode || `SEC_DYN_${dynamicOrder++}`,
              title: s.title ? s.title.trim() : '',
              content: s.content ? s.content.trim() : null,
              imageGroups: this.toStoredImageGroups(s.imageGroups),
              orderIndex: s.orderIndex ?? dynamicOrder,
              isFixed: false,
            }),
          );
        if (newSections.length > 0) {
          await sectionRepo.save(newSections);
        }

        const describe = (rows: ProductionDocumentSection[]) =>
          rows.map((s) => `${s.title}: ${s.content ?? ''}`).join('; ') || null;
        const oldValue = describe(nonFixed);
        const newValue = describe(newSections);
        if (oldValue !== newValue) {
          extraChanges.push({ fieldName: 'sections', oldValue, newValue });
        }
      }

      // Lưu sizeRows (bảng thông số kích thước)
      if (dto.sizeRows !== undefined) {
        const existingSizeRows = await sizeRowRepo.find({
          where: { productionDocumentId: docId },
          order: { orderIndex: 'ASC' },
        });
        if (existingSizeRows.length > 0) {
          await sizeRowRepo.remove(existingSizeRows);
        }

        const newSizeRows: ProductionDocumentSizeRow[] = dto.sizeRows.map(
          (sr, index) =>
            sizeRowRepo.create({
              productionDocumentId: docId,
              sizeLabel: String(sr.sizeLabel || '').trim(),
              measurementName: String(sr.measurementName || '').trim(),
              measurementValue: sr.measurementValue
                ? String(sr.measurementValue).trim()
                : null,
              tolerance: sr.tolerance ? String(sr.tolerance).trim() : null,
              orderIndex: sr.orderIndex ?? index + 1,
            }),
        );
        if (newSizeRows.length > 0) {
          await sizeRowRepo.save(newSizeRows);
        }

        const describe = (rows: ProductionDocumentSizeRow[]) =>
          rows
            .map(
              (r) =>
                `${r.sizeLabel} · ${r.measurementName}: ${r.measurementValue ?? ''}${r.tolerance ? ` (±${r.tolerance})` : ''}`,
            )
            .join('; ') || null;
        const oldValue = describe(existingSizeRows);
        const newValue = describe(newSizeRows);
        if (oldValue !== newValue) {
          extraChanges.push({ fieldName: 'sizeRows', oldValue, newValue });
        }
      }

      const after = this.productionDocAuditSnapshot(doc) as AuditSnapshot;
      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PRODUCT_PRODUCTION_DOC,
        aggregateId: docId,
        parentId: productId,
        targetLabel: doc.name,
        eventType: existingDoc
          ? AuditEventType.UPDATED
          : AuditEventType.CREATED,
        changes: [
          ...diffEntity(before, after, PRODUCTION_DOC_AUDIT_FIELDS),
          ...extraChanges,
        ],
      });
    });

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
    actor?: AuditActor,
  ) {
    const product = await this.assertPoOpenForProduct(
      poId,
      productId,
      'khóa/mở khóa sản phẩm',
    );

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

    const actionText =
      normalizedStatus === ProductStatus.CLOSED
        ? 'Khóa sản phẩm'
        : 'Mở khóa sản phẩm';
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(PurchaseOrderProduct, product);
      await this.recordAudit(manager, actor, {
        aggregateType: AUDIT_TYPE.PRODUCT,
        aggregateId: productId,
        parentId: poId,
        targetLabel: productAuditLabel(product),
        eventType: AuditEventType.STATUS_CHANGED,
        reason: reason?.trim() ? `${actionText}: ${reason.trim()}` : actionText,
        changes:
          oldStatus === normalizedStatus
            ? []
            : [
                {
                  fieldName: 'status',
                  oldValue: oldStatus,
                  newValue: normalizedStatus,
                },
              ],
      });
      return saved;
    });
  }
}
