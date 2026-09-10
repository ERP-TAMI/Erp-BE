import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { assertAllowedFile } from '../../common/utils/file-validation';
import {
  PRESIGN_GET_EXPIRY_SECONDS,
  PRESIGN_PUT_EXPIRY_SECONDS,
  STORAGE_SERVICE,
  StorageService,
} from '../storage/storage.interface';
import { PurchaseOrder } from './entities/PurchaseOrder.entity';
import { PurchaseOrderStatusHistory } from './entities/PurchaseOrderStatusHistory.entity';
import { PurchaseOrderDocument } from './entities/PurchaseOrderDocument.entity';
import { PurchaseOrderProduct } from './entities/PurchaseOrderProduct.entity';
import { Document } from '../documents/entities/Document.entity';
import { DocumentVersion } from '../documents/entities/DocumentVersion.entity';
import { Customer } from '../master-data/entities/Customer.entity';
import {
  DocumentPurpose,
  PoStatus,
  ProductStatus,
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
  PresignPoDocumentDto,
  ConfirmPoDocumentDto,
} from './dto';

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

export interface PaginatedPoResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

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

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderStatusHistory)
    private readonly historyRepo: Repository<PurchaseOrderStatusHistory>,
    @InjectRepository(PurchaseOrderDocument)
    private readonly poDocRepo: Repository<PurchaseOrderDocument>,
    @InjectRepository(PurchaseOrderProduct)
    private readonly productRepo: Repository<PurchaseOrderProduct>,
    @InjectRepository(Document)
    private readonly docRepo: Repository<Document>,
    @InjectRepository(DocumentVersion)
    private readonly docVersionRepo: Repository<DocumentVersion>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageService,
    private readonly dataSource: DataSource,
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

    // Resolved fresh on every read — never persist a presigned URL, it expires
    // after PRESIGN_GET_EXPIRY_SECONDS.
    const formattedDocs = await Promise.all(
      poDocs.map(async (pd) => {
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
          fileUrl: version?.storageKey
            ? await this.storage.getPresignedGetUrl(version.storageKey)
            : null,
          fileName: version?.originalFileName || masterDoc?.title || null,
          fileSize: version?.byteSize ? Number(version.byteSize) : null,
        };
      }),
    );

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
      deadline: po.deadline || null,
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

  // ─── PO Products Management ──────────────────────────────────────────────────

  async getProducts(poId: string): Promise<PurchaseOrderProduct[]> {
    await this.findOne(poId);
    return this.productRepo.find({
      where: { purchaseOrderId: poId },
      order: { createdAt: 'ASC' },
    });
  }

  async addProduct(
    poId: string,
    dto: CreatePoProductDto,
    userId?: string,
  ): Promise<PurchaseOrderProduct> {
    const po = await this.poRepo.findOne({ where: { id: poId } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${poId}`);
    }

    this.checkPoNotLocked(po, 'thêm sản phẩm mới');

    const productCode = (dto.productCode || dto.styleCode)?.trim();
    if (!productCode) {
      throw new BadRequestException('Mã sản phẩm không được để trống');
    }
    const sourceStyleId = dto.sourceStyleId || dto.styleId || undefined;
    const materialNote =
      (dto.materialNote || dto.colorName)?.trim() || undefined;

    const existingProduct = await this.productRepo.findOne({
      where: { purchaseOrderId: poId, productCode },
    });
    if (existingProduct) {
      throw new ConflictException(
        `Mã sản phẩm "${productCode}" đã tồn tại trong PO này.`,
      );
    }

    const now = new Date();
    const product = this.productRepo.create({
      purchaseOrderId: poId,
      sourceStyleId,
      productCode,
      productName: dto.productName.trim(),
      category: dto.category?.trim() || undefined,
      materialNote,
      deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      status: ProductStatus.DRAFT,
      as3bCmBaseDays: dto.as3bCmBaseDays || 30,
      createdBy: (userId || null) as any,
      createdAt: now,
      updatedBy: (userId || null) as any,
      updatedAt: now,
    });

    const saved = await this.productRepo.save(product);

    // Audit log
    const log = this.historyRepo.create({
      purchaseOrderId: poId,
      oldStatus: po.status,
      newStatus: po.status,
      action: 'Thêm sản phẩm vào PO',
      reason: `Thêm sản phẩm ${productCode} — ${dto.productName}`,
      changedBy: userId || null,
      changedAt: now,
    });
    await this.historyRepo.save(log);

    return saved;
  }

  async updateProduct(
    poId: string,
    productId: string,
    dto: UpdatePoProductDto,
    userId?: string,
  ): Promise<PurchaseOrderProduct> {
    const po = await this.poRepo.findOne({ where: { id: poId } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${poId}`);
    }

    this.checkPoNotLocked(po, 'cập nhật sản phẩm');

    const product = await this.productRepo.findOne({
      where: { id: productId, purchaseOrderId: poId },
    });
    if (!product) {
      throw new NotFoundException(
        `Không tìm thấy sản phẩm với ID: ${productId} trong PO này`,
      );
    }

    const incomingProductCode = (dto.productCode || dto.styleCode)?.trim();
    const incomingSourceStyleId = dto.sourceStyleId || dto.styleId;
    const incomingMaterialNote =
      dto.materialNote !== undefined ? dto.materialNote : dto.colorName;

    if (incomingSourceStyleId !== undefined) {
      product.sourceStyleId = (incomingSourceStyleId || null) as any;
    }

    if (incomingProductCode && incomingProductCode !== product.productCode) {
      const duplicate = await this.productRepo.findOne({
        where: { purchaseOrderId: poId, productCode: incomingProductCode },
      });
      if (duplicate) {
        throw new ConflictException(
          `Mã sản phẩm "${incomingProductCode}" đã được sử dụng trong PO này.`,
        );
      }
      product.productCode = incomingProductCode;
    }

    if (dto.productName) product.productName = dto.productName.trim();
    if (dto.category !== undefined)
      product.category = dto.category?.trim() || '';
    if (incomingMaterialNote !== undefined)
      product.materialNote = incomingMaterialNote?.trim() || '';
    if (dto.deadline !== undefined)
      product.deadline = dto.deadline ? new Date(dto.deadline) : (null as any);
    if (dto.as3bCmBaseDays !== undefined)
      product.as3bCmBaseDays = dto.as3bCmBaseDays;

    product.updatedBy = (userId || null) as any;
    product.updatedAt = new Date();

    return this.productRepo.save(product);
  }

  async removeProduct(
    poId: string,
    productId: string,
    userId?: string,
  ): Promise<void> {
    const po = await this.poRepo.findOne({ where: { id: poId } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${poId}`);
    }

    this.checkPoNotLocked(po, 'xóa sản phẩm');

    const product = await this.productRepo.findOne({
      where: { id: productId, purchaseOrderId: poId },
    });
    if (!product) {
      throw new NotFoundException(
        `Không tìm thấy sản phẩm với ID: ${productId} trong PO này`,
      );
    }

    await this.productRepo.remove(product);

    // Audit log
    const log = this.historyRepo.create({
      purchaseOrderId: poId,
      oldStatus: po.status,
      newStatus: po.status,
      action: 'Xóa sản phẩm khỏi PO',
      reason: `Đã xóa sản phẩm ${product.productCode} — ${product.productName}`,
      changedBy: userId || null,
      changedAt: new Date(),
    });
    await this.historyRepo.save(log);
  }

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

    const head = await this.storage.headObject(dto.objectKey);
    if (!head.exists) {
      throw new BadRequestException(
        'Tệp chưa được tải lên thành công, vui lòng thử upload lại.',
      );
    }

    // Server never receives the raw upload (client PUTs straight to S3 with a
    // presigned URL), so the magic-bytes check that used to run on the multer
    // buffer must run here instead, against the bytes actually stored on S3.
    const ext = path.extname(dto.fileName) || '';
    const buffer = await this.storage.getObjectBuffer(dto.objectKey);
    this.validateFileMagicBytes(ext, buffer);

    const now = new Date();

    return this.dataSource.transaction(async (manager) => {
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
    });
  }
}
