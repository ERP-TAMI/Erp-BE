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
import { Document } from '../documents/entities/Document.entity';
import { PoStatus } from '../../common/enums/database.enums';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  QueryPurchaseOrderDto,
  UpdatePoStatusDto,
  LinkPoDocumentDto,
} from './dto';

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
  customerId: string;
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
  documents: {
    documentId: string;
    documentCode: string | null;
    title: string;
    purpose: string;
    linkedAt: Date;
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
    @InjectRepository(Document)
    private readonly docRepo: Repository<Document>,
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

    const now = new Date();
    const poEntity = this.poRepo.create({
      poCode: dto.poCode,
      customerPoCode: dto.customerPoCode || null,
      customerId: dto.customerId,
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
      action: 'Tạo mới PO',
      reason: null,
      changedBy: userId || null,
      changedAt: now,
    });
    await this.historyRepo.save(historyRecord);

    return this.findOne(savedPo.id);
  }

  async findAll(
    query: QueryPurchaseOrderDto,
  ): Promise<PaginatedPoResult<PurchaseOrder>> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const qb = this.poRepo.createQueryBuilder('po');

    if (query.search?.trim()) {
      const searchTerm = `%${query.search.trim()}%`;
      qb.andWhere(
        '(po.poCode ILIKE :search OR po.customerNameSnapshot ILIKE :search OR po.customerPoCode ILIKE :search)',
        { search: searchTerm },
      );
    }

    if (query.poCode?.trim()) {
      qb.andWhere('po.poCode = :poCode', { poCode: query.poCode.trim() });
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

    return {
      items,
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

    if (docIds.length > 0) {
      const docs = await this.docRepo.find({ where: { id: In(docIds) } });
      docsMap = new Map(docs.map((d) => [d.id, d]));
    }

    const formattedDocs = poDocs.map((pd) => {
      const masterDoc = docsMap.get(pd.documentId);
      return {
        documentId: pd.documentId,
        documentCode: masterDoc?.documentCode || null,
        title: masterDoc?.title || 'Tài liệu PO',
        purpose: pd.purpose,
        linkedAt: pd.linkedAt,
      };
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

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
    userId?: string,
  ): Promise<PurchaseOrderDetailResponse> {
    const po = await this.poRepo.findOne({ where: { id } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${id}`);
    }

    if (po.status === PoStatus.CLOSED) {
      throw new BadRequestException(
        'PO đã ở trạng thái Final (đã khóa), chỉ có thể thay đổi thông tin qua luồng điều chỉnh.',
      );
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
      [PoStatus.DRAFT]: [PoStatus.PENDING_RD, PoStatus.CANCELLED],
      [PoStatus.PENDING_RD]: [PoStatus.IN_PROGRESS, PoStatus.CANCELLED],
      [PoStatus.IN_PROGRESS]: [PoStatus.CLOSED, PoStatus.CANCELLED],
      [PoStatus.CLOSED]: [],
      [PoStatus.CANCELLED]: [],
    };

    const allowedNextStatuses = validTransitions[currentStatus] || [];
    if (!allowedNextStatuses.includes(newStatus)) {
      throw new BadRequestException(
        `Không thể chuyển trạng thái từ ${currentStatus} sang ${newStatus}. Vui lòng thực hiện theo đúng luồng: Nháp -> Chờ R&D -> Đang xử lý -> Final / Đã hủy.`,
      );
    }

    if (
      (newStatus === PoStatus.CLOSED || newStatus === PoStatus.CANCELLED) &&
      !dto.reason?.trim()
    ) {
      throw new BadRequestException(
        'Chuyển trạng thái sang Final hoặc Đã hủy bắt buộc phải nhập lý do.',
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
            ? 'Chốt PO Final'
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

  async linkDocument(
    poId: string,
    dto: LinkPoDocumentDto,
    userId?: string,
  ): Promise<PurchaseOrderDetailResponse> {
    const po = await this.poRepo.findOne({ where: { id: poId } });
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn hàng PO với ID: ${poId}`);
    }

    const existingLink = await this.poDocRepo.findOne({
      where: { purchaseOrderId: poId, documentId: dto.documentId },
    });

    if (!existingLink) {
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

  async unlinkDocument(poId: string, documentId: string): Promise<void> {
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
}
