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
import { Repository, In } from 'typeorm';
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
    if (doc.currentVersionId) {
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
}
