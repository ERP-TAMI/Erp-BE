import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Bom } from './entities/Bom.entity';
import { BomRevision } from './entities/BomRevision.entity';
import { BomLine } from './entities/BomLine.entity';
import { BomRevisionStatusHistory } from './entities/BomRevisionStatusHistory.entity';
import { Style } from '../styles/entities/Style.entity';
import { PurchaseOrderProduct } from '../purchase-orders/entities/PurchaseOrderProduct.entity';
import { PurchaseOrder } from '../purchase-orders/entities/PurchaseOrder.entity';
import { PurchaseOrderProductColor } from '../purchase-orders/entities/PurchaseOrderProductColor.entity';
import { PurchaseOrderProductColorSize } from '../purchase-orders/entities/PurchaseOrderProductColorSize.entity';
import { Material } from '../master-data/entities/Material.entity';
import { MaterialGroup } from '../master-data/entities/MaterialGroup.entity';
import { Unit } from '../master-data/entities/Unit.entity';
import { BomCostService } from './bom-cost.service';
import {
  QueryBomsDto,
  QueryBomStatsDto,
  BomListItemDto,
  BomDetailDto,
  BomStatsDto,
  CreateBomDto,
  UpdateBomDto,
  DiscontinueBomDto,
  CreateBomLineDto,
  UpdateBomLineDto,
  ReorderBomLinesDto,
  BomLineResponseDto,
  ForwardBomDto,
  RejectBomDto,
  ApproveBomDto,
  CreateRevisionDto,
  RevisionListItemDto,
  RevisionDetailDto,
  RevisionDiffDto,
  RevisionDiffItemDto,
  CopyFitToPoDto,
} from './dto';
import {
  assertCanCreateBom,
  assertCanUpdateBomHeader,
  assertCanDiscontinueBom,
  assertCanAddLine,
  assertCanUpdateLine,
  assertCanDeleteLine,
  assertCanReorderLines,
  assertCanForwardBom,
  assertCanRejectBom,
  assertCanApproveBom,
  assertCanCreateRevision,
  assertCanCopyFitToPo,
} from './boms.policy';
import { BomRevisionStatus, BomType } from '../../common/enums/database.enums';

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    /** Tổng số BOM tham gia tổng hợp (chỉ trả về từ aggregate endpoint) */
    totalBoms?: number;
    /** Tổng số sản phẩm PO tham gia tổng hợp (chỉ trả về từ aggregate endpoint) */
    totalProducts?: number;
    /** Tổng số đơn hàng PO tham gia tổng hợp (chỉ trả về từ aggregate endpoint) */
    totalPurchaseOrders?: number;
  };
}

@Injectable()
export class BomsService {
  constructor(
    @InjectRepository(Bom)
    private readonly bomRepository: Repository<Bom>,
    @InjectRepository(BomRevision)
    private readonly bomRevisionRepository: Repository<BomRevision>,
    @InjectRepository(BomLine)
    private readonly bomLineRepository: Repository<BomLine>,
    @InjectRepository(BomRevisionStatusHistory)
    private readonly bomStatusHistoryRepository: Repository<BomRevisionStatusHistory>,
    @InjectRepository(Style)
    private readonly styleRepository: Repository<Style>,
    @InjectRepository(PurchaseOrderProduct)
    private readonly poProductRepository: Repository<PurchaseOrderProduct>,
    @InjectRepository(PurchaseOrder)
    private readonly poRepository: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderProductColor)
    private readonly poColorRepository: Repository<PurchaseOrderProductColor>,
    @InjectRepository(PurchaseOrderProductColorSize)
    private readonly poColorSizeRepository: Repository<PurchaseOrderProductColorSize>,
    private readonly bomCostService: BomCostService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * List BOMs with pagination, filtering, and live relation data.
   * Eliminates N+1 queries using bulk fetches for quantities, colors, and costs.
   */
  async findAll(
    query: QueryBomsDto,
    userRole?: string | null,
  ): Promise<PaginatedResult<BomListItemDto>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(100, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.bomRepository.createQueryBuilder('bom');

    // Left join current revision for filtering
    qb.leftJoin(
      'bom_revisions',
      'rev',
      'bom.current_revision_id = rev.id',
    );

    // Left join style for Fit BOM
    qb.leftJoin('styles', 'style', 'bom.style_id = style.id');

    // Left join purchase_order_product & purchase_order for PO BOM
    qb.leftJoin(
      'purchase_order_products',
      'pop',
      'bom.purchase_order_product_id = pop.id',
    );
    qb.leftJoin(
      'purchase_orders',
      'po',
      'pop.purchase_order_id = po.id',
    );

    // ─── Filters ──────────────────────────────────────────────────────────
    if (query.type) {
      qb.andWhere('bom.bom_type = :type', { type: query.type });
    }

    if (query.status) {
      const statusLower = query.status.trim().toLowerCase();
      if (statusLower === 'discontinued') {
        qb.andWhere('bom.discontinued_at IS NOT NULL');
      } else {
        qb.andWhere('bom.discontinued_at IS NULL AND rev.status = :status', {
          status: statusLower,
        });
      }
    }

    if (query.search?.trim()) {
      const searchParam = `%${query.search.trim()}%`;
      qb.andWhere(
        `(
          bom.bom_code ILIKE :search
          OR style.style_code ILIKE :search
          OR style.style_name ILIKE :search
          OR pop.product_code ILIKE :search
          OR pop.product_name ILIKE :search
          OR po.po_code ILIKE :search
        )`,
        { search: searchParam },
      );
    }

    if (query.bomCode?.trim()) {
      qb.andWhere('bom.bom_code ILIKE :bomCode', {
        bomCode: `%${query.bomCode.trim()}%`,
      });
    }

    if (query.style?.trim()) {
      const styleFilter = query.style.trim();
      qb.andWhere(
        '(style.style_code ILIKE :styleFilter OR bom.style_id::text = :styleRaw)',
        {
          styleFilter: `%${styleFilter}%`,
          styleRaw: styleFilter,
        },
      );
    }

    if (query.purchaseOrder?.trim()) {
      const poFilter = query.purchaseOrder.trim();
      qb.andWhere('(po.po_code ILIKE :poFilter OR po.id::text = :poRaw)', {
        poFilter: `%${poFilter}%`,
        poRaw: poFilter,
      });
    }

    if (query.product?.trim()) {
      const prodFilter = query.product.trim();
      qb.andWhere(
        '(pop.product_code ILIKE :prodFilter OR bom.purchase_order_product_id::text = :prodRaw)',
        {
          prodFilter: `%${prodFilter}%`,
          prodRaw: prodFilter,
        },
      );
    }

    // ─── Sorting & Pagination ─────────────────────────────────────────────
    const sortFieldMap: Record<string, string> = {
      bomCode: 'bom.bomCode',
      createdAt: 'bom.createdAt',
      updatedAt: 'bom.updatedAt',
      type: 'bom.bomType',
    };
    const sortColumn =
      (query.sortBy && sortFieldMap[query.sortBy]) || 'bom.createdAt';
    const sortDirection =
      query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    qb.orderBy(sortColumn, sortDirection).addOrderBy('bom.id', 'DESC');
    qb.skip(skip).take(limit);

    // Fetch BOM entities
    const [boms, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    if (boms.length === 0) {
      return {
        data: [],
        meta: { total: 0, page, limit, totalPages: 1 },
      };
    }

    // ─── Anti N+1 Bulk Data Fetching ──────────────────────────────────────
    const isCostVisible = this.bomCostService.isCostVisible(userRole);

    // 1. Bulk calculate costPerUnit for active revisions
    const revisionIds = boms
      .map((b) => b.currentRevisionId)
      .filter((id): id is string => Boolean(id));

    const costPerUnitsMap =
      isCostVisible && revisionIds.length > 0
        ? await this.bomCostService.calculateCostPerUnits(revisionIds)
        : new Map<string, number | null>();

    // 2. Bulk calculate currentOrderQuantity for PO products
    const poProductIds = boms
      .filter((b) => b.bomType === BomType.PO && b.purchaseOrderProductId)
      .map((b) => b.purchaseOrderProductId as string);

    const quantitiesMap =
      poProductIds.length > 0
        ? await this.bomCostService.calculateCurrentOrderQuantities(
            poProductIds,
          )
        : new Map<string, number>();

    // 3. Bulk fetch product colors for PO products
    const colorsMap = new Map<string, string[]>();
    if (poProductIds.length > 0) {
      const colors = await this.poColorRepository.find({
        where: { productId: In(poProductIds) },
        order: { orderIndex: 'ASC' },
      });
      for (const c of colors) {
        if (!colorsMap.has(c.productId)) {
          colorsMap.set(c.productId, []);
        }
        colorsMap.get(c.productId)!.push(c.colorName);
      }
    }

    // 4. Bulk fetch related entities (styles, purchaseOrderProducts, purchaseOrders, revisions)
    const styleIds = boms
      .filter((b) => b.bomType === BomType.FIT && b.styleId)
      .map((b) => b.styleId as string);
    const styles =
      styleIds.length > 0
        ? await this.styleRepository.find({ where: { id: In(styleIds) } })
        : [];
    const stylesMap = new Map(styles.map((s) => [s.id, s]));

    const poProducts =
      poProductIds.length > 0
        ? await this.poProductRepository.find({
            where: { id: In(poProductIds) },
          })
        : [];
    const poProductsMap = new Map(poProducts.map((p) => [p.id, p]));

    const poIds = poProducts
      .map((p) => p.purchaseOrderId)
      .filter((id): id is string => Boolean(id));
    const purchaseOrders =
      poIds.length > 0
        ? await this.poRepository.find({ where: { id: In(poIds) } })
        : [];
    const poMap = new Map(purchaseOrders.map((po) => [po.id, po]));

    const revisions =
      revisionIds.length > 0
        ? await this.bomRevisionRepository.find({
            where: { id: In(revisionIds) },
          })
        : [];
    const revisionsMap = new Map(revisions.map((r) => [r.id, r]));

    // ─── Map to Response DTOs ─────────────────────────────────────────────
    const data: BomListItemDto[] = boms.map((bom) => {
      const currentRevision = bom.currentRevisionId
        ? revisionsMap.get(bom.currentRevisionId) || null
        : null;

      const style = bom.styleId ? stylesMap.get(bom.styleId) || null : null;
      const poProduct = bom.purchaseOrderProductId
        ? poProductsMap.get(bom.purchaseOrderProductId) || null
        : null;
      const po = poProduct?.purchaseOrderId
        ? poMap.get(poProduct.purchaseOrderId) || null
        : null;

      // Status determination
      let status: string = 'wait_nvkh';
      if (bom.discontinuedAt) {
        status = 'discontinued';
      } else if (currentRevision) {
        status = currentRevision.status;
      }

      // Cost calculation
      const costPerUnit =
        isCostVisible && bom.currentRevisionId
          ? (costPerUnitsMap.get(bom.currentRevisionId) ?? null)
          : null;

      const currentOrderQuantity =
        bom.bomType === BomType.PO && bom.purchaseOrderProductId
          ? (quantitiesMap.get(bom.purchaseOrderProductId) ?? 0)
          : null;

      const currentOrderCost = isCostVisible
        ? this.bomCostService.calculateCurrentOrderCost({
            bomType: bom.bomType,
            costPerUnit,
            currentOrderQuantity,
          })
        : null;

      // Live product color names
      const liveColors = bom.purchaseOrderProductId
        ? colorsMap.get(bom.purchaseOrderProductId) || []
        : [];

      return {
        id: bom.id,
        bomCode: bom.bomCode,
        type: bom.bomType,
        status,
        discontinuedAt: bom.discontinuedAt,
        discontinuedReason: bom.discontinuedReason,
        style: style
          ? {
              id: style.id,
              styleCode: style.styleCode,
              styleName: style.styleName,
              category: style.category,
              status: style.status,
              baseImageKey: style.baseImageKey,
            }
          : null,
        purchaseOrder: po
          ? {
              id: po.id,
              poCode: po.poCode,
              customerPoCode: po.customerPoCode,
              customerName: po.customerNameSnapshot,
              receivedDate: po.receivedDate,
              deadline: po.deadline,
              status: po.status,
            }
          : null,
        product: poProduct
          ? {
              id: poProduct.id,
              purchaseOrderId: poProduct.purchaseOrderId,
              productCode: poProduct.productCode,
              productName: poProduct.productName,
              category: poProduct.category,
              deadline: poProduct.deadline,
              status: poProduct.status,
              colors: liveColors,
            }
          : null,
        currentRevision: currentRevision
          ? {
              id: currentRevision.id,
              bomId: currentRevision.bomId,
              revisionNo: currentRevision.revisionNo,
              status: currentRevision.status,
              changeReason: currentRevision.changeReason,
              sourceRevisionId: currentRevision.sourceRevisionId,
              createdBy: currentRevision.createdBy,
              createdAt: currentRevision.createdAt,
              approvedBy: currentRevision.approvedBy,
              approvedAt: currentRevision.approvedAt,
            }
          : null,
        revisionNo: currentRevision?.revisionNo ?? null,
        costPerUnit,
        currentOrderQuantity,
        currentOrderCost,
        colorNameSnapshot: bom.colorNameSnapshot,
        deadline: bom.deadline,
        rdNote: bom.rdNote,
        createdAt: bom.createdAt,
        updatedAt: bom.updatedAt,
      };
    });

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

  /**
   * Retrieves full details of a single BOM by ID.
   * Loads current revision lines keeping orderIndex, calculates dynamic costs,
   * loads live PO/product/color/size relations, and applies role cost masking.
   */
  async findOne(id: string, userRole?: string | null): Promise<BomDetailDto> {
    const bom = await this.bomRepository.findOne({
      where: { id },
    });

    if (!bom) {
      throw new NotFoundException(`Không tìm thấy BOM với ID: ${id}`);
    }

    const isCostVisible = this.bomCostService.isCostVisible(userRole);

    // 1. Load Current Revision & Lines
    let currentRevision: BomRevision | null = null;
    let lines: BomLine[] = [];

    if (bom.currentRevisionId) {
      currentRevision = await this.bomRevisionRepository.findOne({
        where: { id: bom.currentRevisionId },
      });

      lines = await this.bomLineRepository.find({
        where: { revisionId: bom.currentRevisionId },
        order: { orderIndex: 'ASC' },
      });
    }

    // 2. Load Style for Fit BOM
    let style: Style | null = null;
    if (bom.bomType === BomType.FIT && bom.styleId) {
      style = await this.styleRepository.findOne({
        where: { id: bom.styleId },
      });
    }

    // 3. Load Live PO / Product / Colors / Sizes for PO BOM
    let poProduct: PurchaseOrderProduct | null = null;
    let po: PurchaseOrder | null = null;
    const colorsWithSizes: any[] = [];
    let currentOrderQuantity: number | null = null;

    if (bom.bomType === BomType.PO && bom.purchaseOrderProductId) {
      poProduct = await this.poProductRepository.findOne({
        where: { id: bom.purchaseOrderProductId },
      });

      if (poProduct?.purchaseOrderId) {
        po = await this.poRepository.findOne({
          where: { id: poProduct.purchaseOrderId },
        });
      }

      // Load all colors and their sizes
      const colors = await this.poColorRepository.find({
        where: { productId: bom.purchaseOrderProductId },
        order: { orderIndex: 'ASC' },
      });

      const colorIds = colors.map((c) => c.id);
      const allSizes =
        colorIds.length > 0
          ? await this.poColorSizeRepository.find({
              where: { productColorId: In(colorIds) },
              order: { orderIndex: 'ASC' },
            })
          : [];

      for (const c of colors) {
        const sizes = allSizes.filter((s) => s.productColorId === c.id);
        const colorQty = sizes.reduce(
          (sum, s) => sum + (Number(s.quantity) || 0),
          0,
        );
        colorsWithSizes.push({
          id: c.id,
          colorName: c.colorName,
          orderIndex: c.orderIndex,
          totalQuantity: colorQty,
          sizes: sizes.map((s) => ({
            id: s.id,
            sizeLabel: s.sizeLabel,
            quantity: Number(s.quantity) || 0,
            orderIndex: s.orderIndex,
          })),
        });
      }

      // Calculate live dynamic quantity
      currentOrderQuantity =
        await this.bomCostService.calculateCurrentOrderQuantity(
          bom.purchaseOrderProductId,
        );
    }

    // 4. Calculate Costs
    const costPerUnit = isCostVisible
      ? this.bomCostService.calculateCostPerUnit(lines)
      : null;

    const currentOrderCost = isCostVisible
      ? this.bomCostService.calculateCurrentOrderCost({
          bomType: bom.bomType,
          costPerUnit,
          currentOrderQuantity,
        })
      : null;

    // 5. Determine Status
    let status: string = 'wait_nvkh';
    if (bom.discontinuedAt) {
      status = 'discontinued';
    } else if (currentRevision) {
      status = currentRevision.status;
    }

    // 6. Map Lines (masking unitCost and lineCost for unauthorized roles)
    const lineDtos = lines.map((l) => ({
      id: l.id,
      revisionId: l.revisionId,
      materialId: l.materialId,
      materialNameSnapshot: l.materialNameSnapshot,
      materialGroupId: l.materialGroupId,
      materialGroupSnapshot: l.materialGroupSnapshot,
      unitId: l.unitId,
      unitSnapshot: l.unitSnapshot,
      consumption: Number(l.consumption) || 0,
      unitCost:
        isCostVisible && l.unitCost !== null ? Number(l.unitCost) : null,
      lineCost: isCostVisible ? this.bomCostService.calculateLineCost(l) : null,
      note: l.note,
      orderIndex: l.orderIndex,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }));

    return {
      id: bom.id,
      bomCode: bom.bomCode,
      type: bom.bomType,
      status,
      deadline: bom.deadline,
      rdNote: bom.rdNote,
      discontinuedAt: bom.discontinuedAt,
      discontinuedBy: bom.discontinuedBy,
      discontinuedReason: bom.discontinuedReason,
      colorNameSnapshot: bom.colorNameSnapshot,
      style: style
        ? {
            id: style.id,
            styleCode: style.styleCode,
            styleName: style.styleName,
            category: style.category,
            status: style.status,
            baseImageKey: style.baseImageKey,
          }
        : null,
      product: poProduct
        ? {
            id: poProduct.id,
            purchaseOrderId: poProduct.purchaseOrderId,
            productCode: poProduct.productCode,
            productName: poProduct.productName,
            category: poProduct.category,
            deadline: poProduct.deadline,
            status: poProduct.status,
            colors: colorsWithSizes.map((c: any) => c.colorName),
          }
        : null,
      purchaseOrderProduct: poProduct
        ? {
            id: poProduct.id,
            purchaseOrderId: poProduct.purchaseOrderId,
            productCode: poProduct.productCode,
            productName: poProduct.productName,
            category: poProduct.category,
            deadline: poProduct.deadline,
            status: poProduct.status,
            purchaseOrder: po
              ? {
                  id: po.id,
                  poCode: po.poCode,
                  customerPoCode: po.customerPoCode,
                  customerName: po.customerNameSnapshot,
                  receivedDate: po.receivedDate,
                  deadline: po.deadline,
                  status: po.status,
                }
              : null,
            colors: colorsWithSizes,
          }
        : null,
      purchaseOrder: po
        ? {
            id: po.id,
            poCode: po.poCode,
            customerPoCode: po.customerPoCode,
            customerName: po.customerNameSnapshot,
            receivedDate: po.receivedDate,
            deadline: po.deadline,
            status: po.status,
          }
        : null,
      currentRevision: currentRevision
        ? {
            id: currentRevision.id,
            bomId: currentRevision.bomId,
            revisionNo: currentRevision.revisionNo,
            status: currentRevision.status,
            changeReason: currentRevision.changeReason,
            sourceRevisionId: currentRevision.sourceRevisionId,
            createdBy: currentRevision.createdBy,
            createdAt: currentRevision.createdAt,
            approvedBy: currentRevision.approvedBy,
            approvedAt: currentRevision.approvedAt,
          }
        : null,
      lines: lineDtos,
      costPerUnit,
      currentOrderQuantity,
      currentOrderCost,
      rowVersion: bom.rowVersion,
      createdAt: bom.createdAt,
      updatedAt: bom.updatedAt,
    };
  }

  /**
   * Aggregates stats by workflow steps:
   * - total: total BOMs
   * - draftCount: wait_nvkh
   * - pendingCount: wait_rd, wait_tpkh_confirm, wait_accounting, wait_sa_approve
   * - approvedCount: closed
   * - discontinuedCount: discontinued_at IS NOT NULL
   */
  async getStats(query: QueryBomStatsDto): Promise<BomStatsDto> {
    const qb = this.bomRepository.createQueryBuilder('bom');
    qb.leftJoin('bom_revisions', 'rev', 'bom.current_revision_id = rev.id');

    if (query.type) {
      qb.andWhere('bom.bom_type = :type', { type: query.type });
    }

    if (query.startDate && query.endDate) {
      const start = new Date(query.startDate);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(query.endDate);
      end.setUTCHours(23, 59, 59, 999);
      qb.andWhere('bom.created_at >= :start AND bom.created_at <= :end', {
        start,
        end,
      });
    } else if (query.startDate) {
      const start = new Date(query.startDate);
      start.setUTCHours(0, 0, 0, 0);
      qb.andWhere('bom.created_at >= :start', { start });
    } else if (query.endDate) {
      const end = new Date(query.endDate);
      end.setUTCHours(23, 59, 59, 999);
      qb.andWhere('bom.created_at <= :end', { end });
    } else if (query.month) {
      const [yearStr, monthStr] = query.month.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month, 1));
      qb.andWhere(
        'bom.created_at >= :startDate AND bom.created_at < :endDate',
        {
          startDate,
          endDate,
        },
      );
    } else if (query.year) {
      const year = parseInt(String(query.year), 10);
      const startDate = new Date(Date.UTC(year, 0, 1));
      const endDate = new Date(Date.UTC(year + 1, 0, 1));
      qb.andWhere(
        'bom.created_at >= :startDate AND bom.created_at < :endDate',
        {
          startDate,
          endDate,
        },
      );
    }

    const rows = await qb
      .select('bom.discontinued_at', 'discontinuedAt')
      .addSelect('rev.status', 'status')
      .getRawMany<{
        discontinuedAt: Date | null;
        status: BomRevisionStatus | null;
      }>();

    let total = 0;
    let draftCount = 0;
    let pendingCount = 0;
    let approvedCount = 0;
    let discontinuedCount = 0;

    const byStatus: Record<string, number> = {
      wait_nvkh: 0,
      wait_rd: 0,
      wait_tpkh_confirm: 0,
      wait_accounting: 0,
      wait_sa_approve: 0,
      closed: 0,
      discontinued: 0,
    };

    const pendingStatuses = new Set([
      BomRevisionStatus.WAIT_RD,
      BomRevisionStatus.WAIT_TPKH_CONFIRM,
      BomRevisionStatus.WAIT_ACCOUNTING,
      BomRevisionStatus.WAIT_SA_APPROVE,
    ]);

    for (const r of rows) {
      total++;
      if (r.discontinuedAt) {
        discontinuedCount++;
        byStatus.discontinued = (byStatus.discontinued || 0) + 1;
      } else {
        const st = r.status || BomRevisionStatus.WAIT_NVKH;
        byStatus[st] = (byStatus[st] || 0) + 1;

        if (st === BomRevisionStatus.WAIT_NVKH) {
          draftCount++;
        } else if (pendingStatuses.has(st)) {
          pendingCount++;
        } else if (st === BomRevisionStatus.CLOSED) {
          approvedCount++;
        }
      }
    }

    return {
      total,
      draftCount,
      pendingCount,
      approvedCount,
      discontinuedCount,
      byStatus,
    };
  }

  /**
   * Creates a new BOM (Fit BOM or PO BOM) within an atomic transaction.
   * Creates initial revision (rev 1, wait_nvkh) and points current_revision_id to it.
   */
  async create(
    dto: CreateBomDto,
    userId?: string,
    roleCode?: string,
  ): Promise<BomDetailDto> {
    assertCanCreateBom(roleCode);

    if (dto.type === BomType.FIT) {
      if (!dto.styleId) {
        throw new BadRequestException('styleId là bắt buộc đối với Fit BOM.');
      }
      if (dto.purchaseOrderProductId) {
        throw new BadRequestException(
          'purchaseOrderProductId không được phép truyền cho Fit BOM.',
        );
      }
    } else if (dto.type === BomType.PO) {
      if (!dto.purchaseOrderProductId) {
        throw new BadRequestException(
          'purchaseOrderProductId là bắt buộc đối với PO BOM.',
        );
      }
      if (dto.styleId) {
        throw new BadRequestException(
          'styleId không được phép truyền cho PO BOM.',
        );
      }
    } else {
      throw new BadRequestException('Loại BOM không hợp lệ.');
    }

    if ((dto as any).productColorId) {
      throw new BadRequestException(
        'productColorId không còn được hỗ trợ. BOM thuộc về Product trong PO.',
      );
    }

    const createdBomId = await this.dataSource.transaction(async (manager) => {
      try {
        let bomCode: string;
        let styleId: string | null = null;
        let purchaseOrderProductId: string | null = null;

        if (dto.type === BomType.FIT) {
          styleId = dto.styleId!;
          const style = await manager.findOne(Style, {
            where: { id: styleId },
          });
          if (!style) {
            throw new NotFoundException(
              `Không tìm thấy mẫu Fit với ID: ${styleId}`,
            );
          }

          const existingFitBom = await manager.findOne(Bom, {
            where: { bomType: BomType.FIT, styleId },
          });
          if (existingFitBom) {
            throw new ConflictException(
              'Mẫu Fit này đã có BOM (FIT BOM đã tồn tại).',
            );
          }

          bomCode = `BOM-FIT-${style.styleCode.trim()}`;
        } else {
          purchaseOrderProductId = dto.purchaseOrderProductId!;
          const pop = await manager.findOne(PurchaseOrderProduct, {
            where: { id: purchaseOrderProductId },
          });
          if (!pop) {
            throw new NotFoundException(
              `Không tìm thấy sản phẩm trong đơn hàng với ID: ${purchaseOrderProductId}`,
            );
          }

          const po = await manager.findOne(PurchaseOrder, {
            where: { id: pop.purchaseOrderId },
          });
          if (!po) {
            throw new BadRequestException(
              'Sản phẩm không thuộc đơn hàng hợp lệ.',
            );
          }

          const existingPoBom = await manager.findOne(Bom, {
            where: { bomType: BomType.PO, purchaseOrderProductId },
          });
          if (existingPoBom) {
            throw new ConflictException(
              'Sản phẩm trong đơn hàng này đã có BOM (PO BOM đã tồn tại).',
            );
          }

          bomCode = `BOM-${po.poCode.trim()}-${pop.productCode.trim()}`;
        }

        const codeCollision = await manager.findOne(Bom, {
          where: { bomCode },
        });
        if (codeCollision) {
          throw new ConflictException(
            `Mã BOM "${bomCode}" đã tồn tại trong hệ thống.`,
          );
        }

        // Step 1: Insert BOM with currentRevisionId = null initially
        const bom = manager.create(Bom, {
          bomCode,
          bomType: dto.type,
          styleId,
          purchaseOrderProductId,
          currentRevisionId: null,
          colorNameSnapshot: null,
          deadline: dto.deadline ? new Date(dto.deadline) : null,
          rdNote: dto.rdNote ? dto.rdNote.trim() : null,
          discontinuedAt: null,
          discontinuedBy: null,
          discontinuedReason: null,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
          rowVersion: 1,
        });

        const savedBom = await manager.save(Bom, bom);

        // Step 2: Insert initial revision (Rev 1, wait_nvkh)
        const revision = manager.create(BomRevision, {
          bomId: savedBom.id,
          revisionNo: 1,
          status: BomRevisionStatus.WAIT_NVKH,
          changeReason: null,
          sourceRevisionId: null,
          createdBy: userId ?? null,
          approvedBy: null,
          approvedAt: null,
          rowVersion: 1,
        });

        const savedRevision = await manager.save(BomRevision, revision);

        // Step 3: Link currentRevisionId on BOM
        savedBom.currentRevisionId = savedRevision.id;
        await manager.save(Bom, savedBom);

        return savedBom.id;
      } catch (err: any) {
        if (err?.code === '23505') {
          if (
            err.detail?.includes('style_id') ||
            err.constraint?.includes('uq_boms_fit_style')
          ) {
            throw new ConflictException(
              'Mẫu Fit này đã có BOM (FIT BOM đã tồn tại).',
            );
          }
          if (
            err.detail?.includes('purchase_order_product_id') ||
            err.constraint?.includes('uq_boms_po_product')
          ) {
            throw new ConflictException(
              'Sản phẩm trong đơn hàng này đã có BOM (PO BOM đã tồn tại).',
            );
          }
          if (
            err.detail?.includes('bom_code') ||
            err.constraint?.includes('boms_bom_code_key')
          ) {
            throw new ConflictException('Mã BOM đã tồn tại trong hệ thống.');
          }
          throw new ConflictException('BOM đã tồn tại trong hệ thống.');
        }
        throw err;
      }
    });

    return this.findOne(createdBomId, roleCode);
  }

  /**
   * Updates BOM header fields (deadline, rdNote).
   * Enforces role authorization per field and rejects changes on discontinued BOMs.
   */
  async update(
    id: string,
    dto: UpdateBomDto,
    userId?: string,
    roleCode?: string,
  ): Promise<BomDetailDto> {
    const bom = await this.bomRepository.findOne({ where: { id } });
    if (!bom) {
      throw new NotFoundException(`Không tìm thấy BOM với ID: ${id}`);
    }

    assertCanUpdateBomHeader(roleCode, dto, bom);

    if (dto.deadline !== undefined) {
      bom.deadline = dto.deadline ? new Date(dto.deadline) : null;
    }

    if (dto.rdNote !== undefined) {
      bom.rdNote = dto.rdNote ? dto.rdNote.trim() : null;
    }

    bom.updatedBy = userId ?? null;
    bom.rowVersion = Number(bom.rowVersion) + 1;

    await this.bomRepository.save(bom);

    return this.findOne(id, roleCode);
  }

  /**
   * Discontinues a BOM with a mandatory reason.
   * Accessible only to TPKH and SA.
   * Historical revisions and lines remain intact and readable.
   */
  async discontinue(
    id: string,
    dto: DiscontinueBomDto,
    userId?: string,
    roleCode?: string,
  ): Promise<BomDetailDto> {
    const bom = await this.bomRepository.findOne({ where: { id } });
    if (!bom) {
      throw new NotFoundException(`Không tìm thấy BOM với ID: ${id}`);
    }

    assertCanDiscontinueBom(roleCode, bom);

    const cleanReason = dto.reason ? dto.reason.trim() : '';
    if (!cleanReason) {
      throw new BadRequestException('Lý do ngừng sử dụng không được để trống.');
    }

    bom.discontinuedAt = new Date();
    bom.discontinuedBy = userId ?? null;
    bom.discontinuedReason = cleanReason;
    bom.updatedBy = userId ?? null;
    bom.rowVersion = Number(bom.rowVersion) + 1;

    await this.bomRepository.save(bom);

    return this.findOne(id, roleCode);
  }

  /**
   * Helper to map a BomLine entity to BomLineResponseDto, applying role cost masking.
   */
  mapLineToDto(line: BomLine, userRole?: string | null): BomLineResponseDto {
    const isCostVisible = this.bomCostService.isCostVisible(userRole);
    return {
      id: line.id,
      revisionId: line.revisionId,
      materialId: line.materialId,
      materialNameSnapshot: line.materialNameSnapshot,
      materialGroupId: line.materialGroupId,
      materialGroupSnapshot: line.materialGroupSnapshot,
      unitId: line.unitId,
      unitSnapshot: line.unitSnapshot,
      consumption: Number(line.consumption),
      unitCost:
        isCostVisible && line.unitCost !== null && line.unitCost !== undefined
          ? Number(line.unitCost)
          : null,
      lineCost: isCostVisible
        ? this.bomCostService.calculateLineCost(line)
        : null,
      note: line.note ?? null,
      orderIndex: line.orderIndex,
      createdAt: line.createdAt,
      updatedAt: line.updatedAt,
    };
  }

  /**
   * Adds a new BOM line to current revision with snapshot from master data.
   * Atomic within transaction.
   */
  async addLine(
    bomId: string,
    dto: CreateBomLineDto,
    _userId?: string,
    userRole?: string | null,
  ): Promise<BomLineResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const bom = await manager.findOne(Bom, { where: { id: bomId } });
      if (!bom) {
        throw new NotFoundException(`Không tìm thấy BOM với ID: ${bomId}`);
      }

      if (!bom.currentRevisionId) {
        throw new BadRequestException('BOM chưa có revision hiện tại.');
      }

      const currentRev = await manager.findOne(BomRevision, {
        where: { id: bom.currentRevisionId },
      });
      if (!currentRev || currentRev.bomId !== bom.id) {
        throw new BadRequestException(
          'Current revision không hợp lệ hoặc không thuộc BOM này.',
        );
      }

      assertCanAddLine(userRole, bom, currentRev);

      const material = await manager.findOne(Material, {
        where: { id: dto.materialId },
      });
      if (!material) {
        throw new NotFoundException(
          `Không tìm thấy vật tư với ID: ${dto.materialId}`,
        );
      }

      // Check duplicate material in current revision
      const existingLine = await manager.findOne(BomLine, {
        where: { revisionId: currentRev.id, materialId: material.id },
      });
      if (existingLine) {
        throw new ConflictException(
          'Vật tư này đã tồn tại trong BOM revision hiện tại.',
        );
      }

      let materialGroupSnapshot: string | null = null;
      if (material.materialGroupId) {
        const mg = await manager.findOne(MaterialGroup, {
          where: { id: material.materialGroupId },
        });
        materialGroupSnapshot = mg?.name || null;
      }

      let unitSnapshot = '';
      if (material.defaultUnitId) {
        const u = await manager.findOne(Unit, {
          where: { id: material.defaultUnitId },
        });
        unitSnapshot = u?.name || '';
      }

      let targetOrderIndex: number;
      if (dto.orderIndex !== undefined && dto.orderIndex !== null) {
        targetOrderIndex = dto.orderIndex;
        // Shift lines >= targetOrderIndex to prevent collision
        const linesToShift = await manager
          .createQueryBuilder(BomLine, 'l')
          .where('l.revision_id = :revId AND l.order_index >= :orderIdx', {
            revId: currentRev.id,
            orderIdx: targetOrderIndex,
          })
          .orderBy('l.order_index', 'DESC')
          .getMany();

        // 2-phase shift: phase 1 temp
        for (let i = 0; i < linesToShift.length; i++) {
          await manager.update(
            BomLine,
            { id: linesToShift[i].id },
            { orderIndex: 1000000 + i },
          );
        }
        // phase 2 final (+1)
        for (let i = 0; i < linesToShift.length; i++) {
          await manager.update(
            BomLine,
            { id: linesToShift[i].id },
            { orderIndex: linesToShift[i].orderIndex + 1 },
          );
        }
      } else {
        const maxLine = await manager
          .createQueryBuilder(BomLine, 'l')
          .where('l.revision_id = :revId', { revId: currentRev.id })
          .orderBy('l.order_index', 'DESC')
          .getOne();
        targetOrderIndex = maxLine ? maxLine.orderIndex + 1 : 0;
      }

      const line = manager.create(BomLine, {
        revisionId: currentRev.id,
        materialId: material.id,
        materialNameSnapshot: material.materialName,
        materialGroupId: material.materialGroupId || null,
        materialGroupSnapshot,
        unitId: material.defaultUnitId || null,
        unitSnapshot,
        consumption:
          dto.consumption !== undefined && dto.consumption !== null
            ? dto.consumption
            : 0,
        unitCost: null,
        note: dto.note ?? null,
        orderIndex: targetOrderIndex,
      });

      try {
        const savedLine = await manager.save(BomLine, line);
        return this.mapLineToDto(savedLine, userRole);
      } catch (err: any) {
        if (err?.code === '23505') {
          throw new ConflictException(
            'Xảy ra xung đột thứ tự dòng hoặc vật tư đã tồn tại.',
          );
        }
        throw err;
      }
    });
  }

  /**
   * Updates an existing BOM line in current revision.
   * Field-level authorization enforced.
   * Material snapshot refreshed ONLY when materialId changes.
   */
  async updateLine(
    bomId: string,
    lineId: string,
    dto: UpdateBomLineDto,
    _userId?: string,
    userRole?: string | null,
  ): Promise<BomLineResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const bom = await manager.findOne(Bom, { where: { id: bomId } });
      if (!bom) {
        throw new NotFoundException(`Không tìm thấy BOM với ID: ${bomId}`);
      }

      if (!bom.currentRevisionId) {
        throw new BadRequestException('BOM chưa có revision hiện tại.');
      }

      const currentRev = await manager.findOne(BomRevision, {
        where: { id: bom.currentRevisionId },
      });
      if (!currentRev || currentRev.bomId !== bom.id) {
        throw new BadRequestException(
          'Current revision không hợp lệ hoặc không thuộc BOM này.',
        );
      }

      assertCanUpdateLine(userRole, bom, currentRev, dto);

      const line = await manager.findOne(BomLine, { where: { id: lineId } });
      if (!line) {
        throw new NotFoundException(
          `Không tìm thấy dòng vật tư với ID: ${lineId}`,
        );
      }

      if (line.revisionId !== currentRev.id) {
        throw new NotFoundException(
          'Dòng vật tư không thuộc revision hiện tại của BOM này.',
        );
      }

      // 1. Material change
      if (dto.materialId !== undefined && dto.materialId !== line.materialId) {
        const newMat = await manager.findOne(Material, {
          where: { id: dto.materialId },
        });
        if (!newMat) {
          throw new NotFoundException(
            `Không tìm thấy vật tư mới với ID: ${dto.materialId}`,
          );
        }

        const dup = await manager.findOne(BomLine, {
          where: { revisionId: currentRev.id, materialId: newMat.id },
        });
        if (dup && dup.id !== line.id) {
          throw new ConflictException(
            'Vật tư mới đã tồn tại trong BOM revision hiện tại.',
          );
        }

        let materialGroupSnapshot: string | null = null;
        if (newMat.materialGroupId) {
          const mg = await manager.findOne(MaterialGroup, {
            where: { id: newMat.materialGroupId },
          });
          materialGroupSnapshot = mg?.name || null;
        }

        let unitSnapshot = '';
        if (newMat.defaultUnitId) {
          const u = await manager.findOne(Unit, {
            where: { id: newMat.defaultUnitId },
          });
          unitSnapshot = u?.name || '';
        }

        line.materialId = newMat.id;
        line.materialNameSnapshot = newMat.materialName;
        line.materialGroupId = newMat.materialGroupId || null;
        line.materialGroupSnapshot = materialGroupSnapshot;
        line.unitId = newMat.defaultUnitId || null;
        line.unitSnapshot = unitSnapshot;
      }

      // 2. Technical fields (only if provided)
      if (dto.consumption !== undefined) {
        line.consumption = dto.consumption;
      }
      if (dto.note !== undefined) {
        line.note = dto.note ?? null;
      }

      // 3. Accounting field (only if provided)
      if (dto.unitCost !== undefined) {
        line.unitCost = dto.unitCost !== null ? Number(dto.unitCost) : null;
      }

      // 4. Order index
      if (dto.orderIndex !== undefined && dto.orderIndex !== line.orderIndex) {
        const targetIdx = dto.orderIndex;
        // Check if target index exists in current revision
        const otherLine = await manager.findOne(BomLine, {
          where: { revisionId: currentRev.id, orderIndex: targetIdx },
        });

        // Temp move current line to safe offset
        await manager.update(BomLine, { id: line.id }, { orderIndex: 1000000 });

        if (otherLine && otherLine.id !== line.id) {
          await manager.update(
            BomLine,
            { id: otherLine.id },
            { orderIndex: line.orderIndex },
          );
        }

        line.orderIndex = targetIdx;
      }

      try {
        const savedLine = await manager.save(BomLine, line);
        return this.mapLineToDto(savedLine, userRole);
      } catch (err: any) {
        if (err?.code === '23505') {
          throw new ConflictException(
            'Xảy ra xung đột thứ tự dòng hoặc vật tư đã tồn tại.',
          );
        }
        throw err;
      }
    });
  }

  /**
   * Deletes a BOM line from the current revision and re-compacts order indices.
   */
  async deleteLine(
    bomId: string,
    lineId: string,
    _userId?: string,
    userRole?: string | null,
  ): Promise<{ success: boolean; message: string }> {
    return this.dataSource.transaction(async (manager) => {
      const bom = await manager.findOne(Bom, { where: { id: bomId } });
      if (!bom) {
        throw new NotFoundException(`Không tìm thấy BOM với ID: ${bomId}`);
      }

      if (!bom.currentRevisionId) {
        throw new BadRequestException('BOM chưa có revision hiện tại.');
      }

      const currentRev = await manager.findOne(BomRevision, {
        where: { id: bom.currentRevisionId },
      });
      if (!currentRev || currentRev.bomId !== bom.id) {
        throw new BadRequestException(
          'Current revision không hợp lệ hoặc không thuộc BOM này.',
        );
      }

      assertCanDeleteLine(userRole, bom, currentRev);

      const line = await manager.findOne(BomLine, { where: { id: lineId } });
      if (!line) {
        throw new NotFoundException(
          `Không tìm thấy dòng vật tư với ID: ${lineId}`,
        );
      }

      if (line.revisionId !== currentRev.id) {
        throw new NotFoundException(
          'Dòng vật tư không thuộc revision hiện tại của BOM này.',
        );
      }

      await manager.remove(BomLine, line);

      // Re-compact orderIndex of remaining lines
      const remaining = await manager.find(BomLine, {
        where: { revisionId: currentRev.id },
        order: { orderIndex: 'ASC' },
      });
      for (let i = 0; i < remaining.length; i++) {
        await manager.update(
          BomLine,
          { id: remaining[i].id },
          { orderIndex: 1000000 + i },
        );
      }
      for (let i = 0; i < remaining.length; i++) {
        await manager.update(
          BomLine,
          { id: remaining[i].id },
          { orderIndex: i },
        );
      }

      return { success: true, message: 'Đã xóa dòng vật tư thành công.' };
    });
  }

  /**
   * Reorders lines in the current revision.
   */
  async reorderLines(
    bomId: string,
    dto: ReorderBomLinesDto,
    _userId?: string,
    userRole?: string | null,
  ): Promise<BomLineResponseDto[]> {
    return this.dataSource.transaction(async (manager) => {
      const bom = await manager.findOne(Bom, { where: { id: bomId } });
      if (!bom) {
        throw new NotFoundException(`Không tìm thấy BOM với ID: ${bomId}`);
      }

      if (!bom.currentRevisionId) {
        throw new BadRequestException('BOM chưa có revision hiện tại.');
      }

      const currentRev = await manager.findOne(BomRevision, {
        where: { id: bom.currentRevisionId },
      });
      if (!currentRev || currentRev.bomId !== bom.id) {
        throw new BadRequestException(
          'Current revision không hợp lệ hoặc không thuộc BOM này.',
        );
      }

      assertCanReorderLines(userRole, bom, currentRev);

      const lineIds = dto.items.map((it) => it.lineId);
      const orderIndices = dto.items.map((it) => it.orderIndex);

      if (new Set(lineIds).size !== lineIds.length) {
        throw new BadRequestException(
          'Danh sách sắp xếp có lineId bị trùng lặp.',
        );
      }
      if (new Set(orderIndices).size !== orderIndices.length) {
        throw new BadRequestException(
          'Thứ tự sắp xếp (orderIndex) không được trùng lặp.',
        );
      }

      const lines = await manager.find(BomLine, {
        where: { id: In(lineIds) },
      });
      if (lines.length !== lineIds.length) {
        throw new NotFoundException(
          'Một hoặc nhiều dòng vật tư không tồn tại.',
        );
      }

      for (const l of lines) {
        if (l.revisionId !== currentRev.id) {
          throw new BadRequestException(
            'Một hoặc nhiều dòng vật tư không thuộc revision hiện tại.',
          );
        }
      }

      // 2-phase update
      for (let i = 0; i < lines.length; i++) {
        await manager.update(
          BomLine,
          { id: lines[i].id },
          { orderIndex: 1000000 + i },
        );
      }

      for (const item of dto.items) {
        await manager.update(
          BomLine,
          { id: item.lineId },
          { orderIndex: item.orderIndex },
        );
      }

      const updatedLines = await manager.find(BomLine, {
        where: { revisionId: currentRev.id },
        order: { orderIndex: 'ASC' },
      });

      return updatedLines.map((l) => this.mapLineToDto(l, userRole));
    });
  }

  /**
   * Forwards BOM to the next workflow state.
   * Strictly sequential according to FORWARD_TRANSITIONS matrix.
   * Enforces role authorization and records BomRevisionStatusHistory.
   * Revision invariant: current_revision_id and revision_no NEVER change.
   * Atomic within transaction with pessimistic write locking.
   */
  async forward(
    id: string,
    dto: ForwardBomDto,
    userId?: string,
    roleCode?: string,
  ): Promise<BomDetailDto> {
    await this.dataSource.transaction(async (manager) => {
      const bom = await manager.findOne(Bom, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!bom) {
        throw new NotFoundException(`Không tìm thấy BOM với ID: ${id}`);
      }

      if (!bom.currentRevisionId) {
        throw new BadRequestException('BOM chưa có revision hiện tại.');
      }

      const currentRev = await manager.findOne(BomRevision, {
        where: { id: bom.currentRevisionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!currentRev || currentRev.bomId !== bom.id) {
        throw new BadRequestException(
          'Current revision không hợp lệ hoặc không thuộc BOM này.',
        );
      }

      const nextStatus = assertCanForwardBom(bom, currentRev, roleCode);
      const oldStatus = currentRev.status;

      currentRev.status = nextStatus;
      if (nextStatus === BomRevisionStatus.CLOSED) {
        currentRev.approvedBy = userId ?? null;
        currentRev.approvedAt = new Date();
      } else {
        currentRev.approvedBy = null;
        currentRev.approvedAt = null;
      }
      currentRev.rowVersion = Number(currentRev.rowVersion) + 1;
      await manager.save(BomRevision, currentRev);

      bom.updatedBy = userId ?? null;
      bom.rowVersion = Number(bom.rowVersion) + 1;
      await manager.save(Bom, bom);

      const history = manager.create(BomRevisionStatusHistory, {
        revisionId: currentRev.id,
        oldStatus,
        newStatus: nextStatus,
        action: 'forward',
        reason: (dto?.reason || dto?.note)?.trim() || null,
        changedBy: userId ?? null,
        changedAt: new Date(),
      });
      await manager.save(BomRevisionStatusHistory, history);
    });

    return this.findOne(id, roleCode);
  }

  /**
   * Rejects / returns BOM to an earlier workflow state according to REJECT_TRANSITIONS matrix.
   * Reason is strictly mandatory and non-empty.
   * Enforces role authorization and records BomRevisionStatusHistory.
   * Revision invariant: current_revision_id and revision_no NEVER change.
   * Atomic within transaction with pessimistic write locking.
   */
  async reject(
    id: string,
    dto: RejectBomDto,
    userId?: string,
    roleCode?: string,
  ): Promise<BomDetailDto> {
    await this.dataSource.transaction(async (manager) => {
      const bom = await manager.findOne(Bom, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!bom) {
        throw new NotFoundException(`Không tìm thấy BOM với ID: ${id}`);
      }

      if (!bom.currentRevisionId) {
        throw new BadRequestException('BOM chưa có revision hiện tại.');
      }

      const currentRev = await manager.findOne(BomRevision, {
        where: { id: bom.currentRevisionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!currentRev || currentRev.bomId !== bom.id) {
        throw new BadRequestException(
          'Current revision không hợp lệ hoặc không thuộc BOM này.',
        );
      }

      const cleanReason = dto?.reason ? dto.reason.trim() : '';
      assertCanRejectBom(
        bom,
        currentRev,
        roleCode,
        dto.targetStatus,
        cleanReason,
      );

      const oldStatus = currentRev.status;
      currentRev.status = dto.targetStatus;
      if (dto.targetStatus === BomRevisionStatus.CLOSED) {
        currentRev.approvedBy = userId ?? null;
        currentRev.approvedAt = new Date();
      } else {
        currentRev.approvedBy = null;
        currentRev.approvedAt = null;
      }
      currentRev.rowVersion = Number(currentRev.rowVersion) + 1;
      await manager.save(BomRevision, currentRev);

      bom.updatedBy = userId ?? null;
      bom.rowVersion = Number(bom.rowVersion) + 1;
      await manager.save(Bom, bom);

      const history = manager.create(BomRevisionStatusHistory, {
        revisionId: currentRev.id,
        oldStatus,
        newStatus: dto.targetStatus,
        action: 'reject',
        reason: cleanReason,
        changedBy: userId ?? null,
        changedAt: new Date(),
      });
      await manager.save(BomRevisionStatusHistory, history);
    });

    return this.findOne(id, roleCode);
  }

  /**
   * Approves and closes BOM when in wait_sa_approve status.
   * Only SA role is permitted.
   * Updates revision status to 'closed', sets approvedBy and approvedAt.
   * Records BomRevisionStatusHistory with action = 'approve'.
   * Revision invariant: current_revision_id and revision_no NEVER change.
   * Atomic within transaction with pessimistic write locking.
   */
  async approve(
    id: string,
    dto: ApproveBomDto,
    userId?: string,
    roleCode?: string,
  ): Promise<BomDetailDto> {
    await this.dataSource.transaction(async (manager) => {
      const bom = await manager.findOne(Bom, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!bom) {
        throw new NotFoundException(`Không tìm thấy BOM với ID: ${id}`);
      }

      if (!bom.currentRevisionId) {
        throw new BadRequestException('BOM chưa có revision hiện tại.');
      }

      const currentRev = await manager.findOne(BomRevision, {
        where: { id: bom.currentRevisionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!currentRev || currentRev.bomId !== bom.id) {
        throw new BadRequestException(
          'Current revision không hợp lệ hoặc không thuộc BOM này.',
        );
      }

      assertCanApproveBom(bom, currentRev, roleCode);

      const oldStatus = currentRev.status;
      currentRev.status = BomRevisionStatus.CLOSED;
      currentRev.approvedBy = userId ?? null;
      currentRev.approvedAt = new Date();
      currentRev.rowVersion = Number(currentRev.rowVersion) + 1;
      await manager.save(BomRevision, currentRev);

      bom.updatedBy = userId ?? null;
      bom.rowVersion = Number(bom.rowVersion) + 1;
      await manager.save(Bom, bom);

      const history = manager.create(BomRevisionStatusHistory, {
        revisionId: currentRev.id,
        oldStatus,
        newStatus: BomRevisionStatus.CLOSED,
        action: 'approve',
        reason: (dto?.reason || dto?.note)?.trim() || null,
        changedBy: userId ?? null,
        changedAt: new Date(),
      });
      await manager.save(BomRevisionStatusHistory, history);
    });

    return this.findOne(id, roleCode);
  }

  /**
   * Creates a new working revision by cloning the current closed revision.
   * Increments revision number, links source_revision_id, clones all lines with historical snapshots and unitCost.
   * Points bom.currentRevisionId to the new revision and sets status = wait_nvkh.
   * Atomic within transaction with pessimistic write locking on BOM and current revision.
   */
  async createRevision(
    id: string,
    dto: CreateRevisionDto,
    userId?: string,
    roleCode?: string,
  ): Promise<BomDetailDto> {
    const rawReason = dto?.reason || dto?.changeReason;
    const cleanReason = rawReason ? rawReason.trim() : '';
    if (!cleanReason) {
      throw new BadRequestException(
        'Lý do tạo revision mới không được để trống hoặc chỉ chứa khoảng trắng.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const bom = await manager.findOne(Bom, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!bom) {
        throw new NotFoundException(`Không tìm thấy BOM với ID: ${id}`);
      }

      if (!bom.currentRevisionId) {
        throw new BadRequestException('BOM chưa có revision hiện tại.');
      }

      const currentRev = await manager.findOne(BomRevision, {
        where: { id: bom.currentRevisionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!currentRev || currentRev.bomId !== bom.id) {
        throw new BadRequestException(
          'Current revision không hợp lệ hoặc không thuộc BOM này.',
        );
      }

      assertCanCreateRevision(roleCode, bom, currentRev);

      const nextRevisionNo = currentRev.revisionNo + 1;

      // Check unique constraint preemptively
      const existing = await manager.findOne(BomRevision, {
        where: { bomId: bom.id, revisionNo: nextRevisionNo },
      });
      if (existing) {
        throw new ConflictException(
          `Revision số ${nextRevisionNo} đã tồn tại cho BOM này.`,
        );
      }

      const newRevision = manager.create(BomRevision, {
        bomId: bom.id,
        revisionNo: nextRevisionNo,
        status: BomRevisionStatus.WAIT_NVKH,
        sourceRevisionId: currentRev.id,
        changeReason: cleanReason,
        createdBy: userId ?? null,
        approvedBy: null,
        approvedAt: null,
        rowVersion: 1,
      });

      let savedRevision: BomRevision;
      try {
        savedRevision = await manager.save(BomRevision, newRevision);
      } catch (err: any) {
        if (err?.code === '23505') {
          throw new ConflictException(
            `Revision số ${nextRevisionNo} đã tồn tại cho BOM này.`,
          );
        }
        throw err;
      }

      // Clone lines from currentRev
      const currentLines = await manager.find(BomLine, {
        where: { revisionId: currentRev.id },
        order: { orderIndex: 'ASC' },
      });

      if (currentLines.length > 0) {
        const clonedLines = currentLines.map((l) =>
          manager.create(BomLine, {
            revisionId: savedRevision.id,
            materialId: l.materialId,
            materialNameSnapshot: l.materialNameSnapshot,
            materialGroupId: l.materialGroupId,
            materialGroupSnapshot: l.materialGroupSnapshot,
            unitId: l.unitId,
            unitSnapshot: l.unitSnapshot,
            consumption: l.consumption,
            unitCost:
              l.unitCost !== null && l.unitCost !== undefined
                ? Number(l.unitCost)
                : null,
            note: l.note,
            orderIndex: l.orderIndex,
          }),
        );
        await manager.save(BomLine, clonedLines);
      }

      bom.currentRevisionId = savedRevision.id;
      bom.updatedBy = userId ?? null;
      bom.rowVersion = Number(bom.rowVersion) + 1;
      await manager.save(Bom, bom);
    });

    return this.findOne(id, roleCode);
  }

  /**
   * Retrieves summary list of all revisions of a BOM (sorted revisionNo DESC).
   * Anti-N+1: does NOT load lines of all revisions.
   */
  async getRevisions(bomId: string): Promise<RevisionListItemDto[]> {
    const bom = await this.bomRepository.findOne({ where: { id: bomId } });
    if (!bom) {
      throw new NotFoundException(`Không tìm thấy BOM với ID: ${bomId}`);
    }

    const revisions = await this.bomRevisionRepository.find({
      where: { bomId },
      order: { revisionNo: 'DESC' },
    });

    return revisions.map((rev) => ({
      id: rev.id,
      bomId: rev.bomId,
      revisionNo: rev.revisionNo,
      status: rev.status,
      sourceRevisionId: rev.sourceRevisionId,
      changeReason: rev.changeReason,
      createdBy: rev.createdBy,
      createdAt: rev.createdAt,
      approvedBy: rev.approvedBy,
      approvedAt: rev.approvedAt,
      isCurrent: rev.id === bom.currentRevisionId,
    }));
  }

  /**
   * Retrieves full details of a single historical or current revision, including lines and role cost masking.
   */
  async getRevisionDetail(
    bomId: string,
    revisionId: string,
    userRole?: string | null,
  ): Promise<RevisionDetailDto> {
    const bom = await this.bomRepository.findOne({ where: { id: bomId } });
    if (!bom) {
      throw new NotFoundException(`Không tìm thấy BOM với ID: ${bomId}`);
    }

    const revision = await this.bomRevisionRepository.findOne({
      where: { id: revisionId },
    });
    if (!revision || revision.bomId !== bom.id) {
      throw new NotFoundException(
        `Không tìm thấy revision với ID: ${revisionId} thuộc BOM này.`,
      );
    }

    const lines = await this.bomLineRepository.find({
      where: { revisionId: revision.id },
      order: { orderIndex: 'ASC' },
    });

    const isCostVisible = this.bomCostService.isCostVisible(userRole);
    const lineDtos = lines.map((l) => this.mapLineToDto(l, userRole));
    const costPerUnit = isCostVisible
      ? this.bomCostService.calculateCostPerUnit(lines)
      : null;

    return {
      id: revision.id,
      bomId: revision.bomId,
      revisionNo: revision.revisionNo,
      status: revision.status,
      sourceRevisionId: revision.sourceRevisionId,
      changeReason: revision.changeReason,
      createdBy: revision.createdBy,
      createdAt: revision.createdAt,
      approvedBy: revision.approvedBy,
      approvedAt: revision.approvedAt,
      isCurrent: revision.id === bom.currentRevisionId,
      lines: lineDtos,
      costPerUnit,
    };
  }

  /**
   * Retrieves workflow status transition history for a specific revision.
   */
  async getRevisionHistory(
    bomId: string,
    revisionId: string,
  ): Promise<BomRevisionStatusHistory[]> {
    const bom = await this.bomRepository.findOne({ where: { id: bomId } });
    if (!bom) {
      throw new NotFoundException(`Không tìm thấy BOM với ID: ${bomId}`);
    }

    const revision = await this.bomRevisionRepository.findOne({
      where: { id: revisionId },
    });
    if (!revision || revision.bomId !== bom.id) {
      throw new NotFoundException(
        `Không tìm thấy revision với ID: ${revisionId} thuộc BOM này.`,
      );
    }

    return this.bomStatusHistoryRepository.find({
      where: { revisionId: revision.id },
      order: { changedAt: 'ASC', id: 'ASC' },
    });
  }

  /**
   * Compares a target revision against its source revision (or compareWithRevisionId).
   * Categorizes items as ADDED, REMOVED, CHANGED, UNCHANGED by materialId business key.
   * Applies role cost masking.
   */
  async getRevisionDiff(
    bomId: string,
    revisionId: string,
    compareWithRevisionId?: string,
    userRole?: string | null,
  ): Promise<RevisionDiffDto> {
    const bom = await this.bomRepository.findOne({ where: { id: bomId } });
    if (!bom) {
      throw new NotFoundException(`Không tìm thấy BOM với ID: ${bomId}`);
    }

    const targetRev = await this.bomRevisionRepository.findOne({
      where: { id: revisionId },
    });
    if (!targetRev || targetRev.bomId !== bom.id) {
      throw new NotFoundException(
        `Không tìm thấy revision với ID: ${revisionId} thuộc BOM này.`,
      );
    }

    const baseRevId = compareWithRevisionId || targetRev.sourceRevisionId;
    if (!baseRevId) {
      throw new BadRequestException(
        'Revision này không có source revision và không có compareWithRevisionId để so sánh diff.',
      );
    }

    const baseRev = await this.bomRevisionRepository.findOne({
      where: { id: baseRevId },
    });
    if (!baseRev || baseRev.bomId !== bom.id) {
      throw new BadRequestException(
        'Revision nguồn dùng để so sánh không tồn tại hoặc không thuộc BOM này.',
      );
    }

    const targetLines = await this.bomLineRepository.find({
      where: { revisionId: targetRev.id },
      order: { orderIndex: 'ASC' },
    });

    const baseLines = await this.bomLineRepository.find({
      where: { revisionId: baseRev.id },
      order: { orderIndex: 'ASC' },
    });

    const isCostVisible = this.bomCostService.isCostVisible(userRole);

    const oldCostPerUnit = isCostVisible
      ? this.bomCostService.calculateCostPerUnit(baseLines)
      : null;
    const newCostPerUnit = isCostVisible
      ? this.bomCostService.calculateCostPerUnit(targetLines)
      : null;
    const costDifference =
      oldCostPerUnit !== null && newCostPerUnit !== null
        ? Number((newCostPerUnit - oldCostPerUnit).toFixed(2))
        : null;

    const baseLineMap = new Map<string, BomLine>();
    for (const bl of baseLines) {
      if (bl.materialId) baseLineMap.set(bl.materialId, bl);
    }

    const targetLineMap = new Map<string, BomLine>();
    for (const tl of targetLines) {
      if (tl.materialId) targetLineMap.set(tl.materialId, tl);
    }

    const allMaterialIds = new Set<string>([
      ...Array.from(baseLineMap.keys()),
      ...Array.from(targetLineMap.keys()),
    ]);

    let totalAdded = 0;
    let totalRemoved = 0;
    let totalChanged = 0;
    let totalUnchanged = 0;
    const items: RevisionDiffItemDto[] = [];

    const mapSnapshot = (line: BomLine) => ({
      consumption: Number(line.consumption),
      unitCost:
        isCostVisible && line.unitCost !== null && line.unitCost !== undefined
          ? Number(line.unitCost)
          : null,
      lineCost: isCostVisible
        ? this.bomCostService.calculateLineCost(line)
        : null,
      note: line.note ?? null,
      orderIndex: line.orderIndex,
      materialNameSnapshot: line.materialNameSnapshot,
      materialGroupSnapshot: line.materialGroupSnapshot,
      unitSnapshot: line.unitSnapshot,
    });

    for (const matId of allMaterialIds) {
      const baseLine = baseLineMap.get(matId);
      const targetLine = targetLineMap.get(matId);

      if (!baseLine && targetLine) {
        totalAdded++;
        items.push({
          materialId: matId,
          materialNameSnapshot: targetLine.materialNameSnapshot,
          materialGroupSnapshot: targetLine.materialGroupSnapshot,
          unitSnapshot: targetLine.unitSnapshot,
          diffType: 'ADDED',
          oldLine: null,
          newLine: mapSnapshot(targetLine),
          changes: {},
        });
      } else if (baseLine && !targetLine) {
        totalRemoved++;
        items.push({
          materialId: matId,
          materialNameSnapshot: baseLine.materialNameSnapshot,
          materialGroupSnapshot: baseLine.materialGroupSnapshot,
          unitSnapshot: baseLine.unitSnapshot,
          diffType: 'REMOVED',
          oldLine: mapSnapshot(baseLine),
          newLine: null,
          changes: {},
        });
      } else if (baseLine && targetLine) {
        const changes: Record<string, { old: any; new: any }> = {};

        if (Number(baseLine.consumption) !== Number(targetLine.consumption)) {
          changes.consumption = {
            old: Number(baseLine.consumption),
            new: Number(targetLine.consumption),
          };
        }

        const baseUnitCost =
          baseLine.unitCost !== null && baseLine.unitCost !== undefined
            ? Number(baseLine.unitCost)
            : null;
        const targetUnitCost =
          targetLine.unitCost !== null && targetLine.unitCost !== undefined
            ? Number(targetLine.unitCost)
            : null;
        if (baseUnitCost !== targetUnitCost) {
          changes.unitCost = {
            old: isCostVisible ? baseUnitCost : null,
            new: isCostVisible ? targetUnitCost : null,
          };
        }

        if ((baseLine.note ?? '') !== (targetLine.note ?? '')) {
          changes.note = {
            old: baseLine.note ?? null,
            new: targetLine.note ?? null,
          };
        }

        if (baseLine.orderIndex !== targetLine.orderIndex) {
          changes.orderIndex = {
            old: baseLine.orderIndex,
            new: targetLine.orderIndex,
          };
        }

        if (baseLine.materialNameSnapshot !== targetLine.materialNameSnapshot) {
          changes.materialNameSnapshot = {
            old: baseLine.materialNameSnapshot,
            new: targetLine.materialNameSnapshot,
          };
        }

        if (
          baseLine.materialGroupSnapshot !== targetLine.materialGroupSnapshot
        ) {
          changes.materialGroupSnapshot = {
            old: baseLine.materialGroupSnapshot,
            new: targetLine.materialGroupSnapshot,
          };
        }

        if (baseLine.unitSnapshot !== targetLine.unitSnapshot) {
          changes.unitSnapshot = {
            old: baseLine.unitSnapshot,
            new: targetLine.unitSnapshot,
          };
        }

        const isChanged = Object.keys(changes).length > 0;
        if (isChanged) {
          totalChanged++;
        } else {
          totalUnchanged++;
        }

        items.push({
          materialId: matId,
          materialNameSnapshot: targetLine.materialNameSnapshot,
          materialGroupSnapshot: targetLine.materialGroupSnapshot,
          unitSnapshot: targetLine.unitSnapshot,
          diffType: isChanged ? 'CHANGED' : 'UNCHANGED',
          oldLine: mapSnapshot(baseLine),
          newLine: mapSnapshot(targetLine),
          changes,
        });
      }
    }

    return {
      bomId: bom.id,
      targetRevisionId: targetRev.id,
      targetRevisionNo: targetRev.revisionNo,
      baseRevisionId: baseRev.id,
      baseRevisionNo: baseRev.revisionNo,
      oldCostPerUnit,
      newCostPerUnit,
      costDifference,
      totalAdded,
      totalRemoved,
      totalChanged,
      totalUnchanged,
      items,
    };
  }

  /**
   * Copies material lines from a closed Fit BOM revision into an empty current revision
   * of a PO BOM (status wait_nvkh).
   *
   * Business Rules:
   * 1. Target BOM must be of type 'po', not discontinued, and in wait_nvkh.
   * 2. Target current revision must be empty (0 lines) to prevent accidental overwrites.
   * 3. Source BOM must be of type 'fit' and source revision must be 'closed'.
   * 4. Lines are cloned with new UUIDs, identical snapshots, and unitCost set to NULL.
   * 5. targetRevision.sourceRevisionId is set to sourceRevision.id for lineage tracing.
   * 6. Target BOM rowVersion is incremented.
   * 7. Entire operation runs inside a pessimistic write locked transaction.
   */
  async copyFromFit(
    targetBomId: string,
    dto: CopyFitToPoDto,
    userId?: string,
    roleCode?: string,
  ): Promise<BomDetailDto> {
    await this.dataSource.transaction(async (manager) => {
      // 1. Pessimistic write lock on target BOM
      const targetBom = await manager.findOne(Bom, {
        where: { id: targetBomId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!targetBom) {
        throw new NotFoundException(
          `Không tìm thấy PO BOM với ID: ${targetBomId}`,
        );
      }

      if (targetBom.bomType !== BomType.PO) {
        throw new BadRequestException(
          'Chỉ có thể sao chép Fit BOM vào PO BOM (target BOM type phải là po).',
        );
      }

      if (
        targetBom.discontinuedAt ||
        (targetBom as any).status === 'discontinued'
      ) {
        throw new BadRequestException(
          'Không thể sao chép dữ liệu vào BOM đã ngừng sử dụng.',
        );
      }

      if (!targetBom.currentRevisionId) {
        throw new BadRequestException(
          'Target PO BOM chưa có revision hiện tại.',
        );
      }

      // 2. Load & Lock Target Current Revision
      const targetRev = await manager.findOne(BomRevision, {
        where: { id: targetBom.currentRevisionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!targetRev || targetRev.bomId !== targetBom.id) {
        throw new BadRequestException(
          'Target current revision không hợp lệ hoặc không thuộc BOM này.',
        );
      }

      if (
        targetRev.status !== BomRevisionStatus.WAIT_NVKH &&
        (targetRev.status as any) !== 'wait_nvkh'
      ) {
        throw new BadRequestException(
          `Chỉ có thể sao chép khi revision hiện tại của PO BOM đang ở trạng thái wait_nvkh. Trạng thái hiện tại: ${targetRev.status}`,
        );
      }

      // 3. Prevent Accidental Overwrite: Target MUST have 0 lines
      const existingLineCount = await manager.count(BomLine, {
        where: { revisionId: targetRev.id },
      });

      if (existingLineCount > 0) {
        throw new ConflictException(
          'Không thể sao chép đè: BOM hiện tại đã có dòng vật tư.',
        );
      }

      // 4. Resolve Source Revision & Source Fit BOM
      let sourceRev: BomRevision | null = null;
      let sourceBom: Bom | null = null;

      if (dto.sourceRevisionId) {
        sourceRev = await manager.findOne(BomRevision, {
          where: { id: dto.sourceRevisionId },
        });
        if (!sourceRev) {
          throw new NotFoundException(
            `Không tìm thấy revision nguồn với ID: ${dto.sourceRevisionId}`,
          );
        }

        sourceBom = await manager.findOne(Bom, {
          where: { id: sourceRev.bomId },
        });
        if (!sourceBom) {
          throw new NotFoundException(
            `Không tìm thấy BOM nguồn cho revision ID: ${dto.sourceRevisionId}`,
          );
        }

        // Verify source Fit BOM belongs to the same style as target PO product
        if (targetBom.purchaseOrderProductId) {
          const poProduct = await manager.findOne(PurchaseOrderProduct, {
            where: { id: targetBom.purchaseOrderProductId },
          });
          if (
            poProduct?.sourceStyleId &&
            sourceBom.styleId &&
            sourceBom.styleId !== poProduct.sourceStyleId
          ) {
            throw new BadRequestException(
              'Source revision thuộc Fit BOM của style khác, không thuộc style của sản phẩm đơn hàng này.',
            );
          }
        }
      } else {
        // Auto-resolve via target BOM's purchaseOrderProduct -> sourceStyleId
        if (!targetBom.purchaseOrderProductId) {
          throw new BadRequestException(
            'Target PO BOM không liên kết với sản phẩm đơn hàng.',
          );
        }

        const poProduct = await manager.findOne(PurchaseOrderProduct, {
          where: { id: targetBom.purchaseOrderProductId },
        });

        if (!poProduct?.sourceStyleId) {
          throw new BadRequestException(
            'Vui lòng cung cấp sourceRevisionId do sản phẩm đơn hàng không có sourceStyleId.',
          );
        }

        sourceBom = await manager.findOne(Bom, {
          where: {
            bomType: BomType.FIT,
            styleId: poProduct.sourceStyleId,
          },
        });

        if (!sourceBom) {
          throw new NotFoundException(
            'Không tìm thấy Fit BOM tương ứng cho Style của sản phẩm đơn hàng.',
          );
        }

        if (!sourceBom.currentRevisionId) {
          throw new BadRequestException(
            'Fit BOM tương ứng chưa có revision nào được tạo.',
          );
        }

        sourceRev = await manager.findOne(BomRevision, {
          where: { id: sourceBom.currentRevisionId },
        });

        if (!sourceRev || sourceRev.status !== BomRevisionStatus.CLOSED) {
          throw new BadRequestException(
            'Fit BOM tương ứng chưa có revision nào đã đóng (closed).',
          );
        }
      }

      // 5. Enforce Authorization Policy & State Rules
      assertCanCopyFitToPo(
        targetBom,
        targetRev,
        sourceBom,
        sourceRev,
        roleCode,
      );

      // 6. Fetch Source Lines to Clone
      const sourceLines = await manager.find(BomLine, {
        where: { revisionId: sourceRev.id },
        order: { orderIndex: 'ASC' },
      });

      // 7. Clone Lines: New UUIDs, identical snapshots, unitCost = NULL
      if (sourceLines.length > 0) {
        const clonedLines = sourceLines.map((l) =>
          manager.create(BomLine, {
            revisionId: targetRev.id,
            materialId: l.materialId,
            materialNameSnapshot: l.materialNameSnapshot,
            materialGroupId: l.materialGroupId,
            materialGroupSnapshot: l.materialGroupSnapshot,
            unitId: l.unitId,
            unitSnapshot: l.unitSnapshot,
            consumption: l.consumption,
            unitCost: null, // CRITICAL: Reset unit cost to NULL
            note: l.note,
            orderIndex: l.orderIndex,
          }),
        );
        try {
          await manager.save(BomLine, clonedLines);
        } catch (err: any) {
          if (err?.code === '23505') {
            throw new ConflictException(
              'Xảy ra xung đột vật tư hoặc thứ tự dòng khi sao chép.',
            );
          }
          throw err;
        }
      }

      // 8. Update Target Revision Lineage (sourceRevisionId)
      targetRev.sourceRevisionId = sourceRev.id;
      await manager.save(BomRevision, targetRev);

      // 9. Increment Target BOM rowVersion
      targetBom.rowVersion = Number(targetBom.rowVersion) + 1;
      targetBom.updatedBy = userId ?? targetBom.updatedBy;
      targetBom.updatedAt = new Date();
      await manager.save(Bom, targetBom);
    });

    // 10. Return target BOM detail with live quantities and cost masking
    return this.findOne(targetBomId, roleCode);
  }
}
