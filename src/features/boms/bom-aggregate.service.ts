import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bom } from './entities/Bom.entity';
import { BomRevision } from './entities/BomRevision.entity';
import { BomLine } from './entities/BomLine.entity';
import { PurchaseOrderProduct } from '../purchase-orders/entities/PurchaseOrderProduct.entity';
import { PurchaseOrderProductColor } from '../purchase-orders/entities/PurchaseOrderProductColor.entity';
import { PurchaseOrderProductColorSize } from '../purchase-orders/entities/PurchaseOrderProductColorSize.entity';
import { BomCostService } from './bom-cost.service';
import {
  QueryBomAggregateDto,
  AggregateBreakdownType,
} from './dto/query-bom-aggregate.dto';
import {
  BomAggregateItemDto,
  AggregateBreakdownItemDto,
} from './dto/bom-aggregate-response.dto';
import { PaginatedResult } from './boms.service';
import { BomRevisionStatus, BomType } from '../../common/enums/database.enums';

interface ColorSizeAggItem {
  productId: string;
  productCode: string;
  productName: string;
  colorName: string;
  sizeLabel: string;
  quantity: number;
}

interface MaterialAggregator {
  materialId: string;
  materialNameSnapshot: string;
  materialGroupSnapshot: string | null;
  unitSnapshot: string;
  totalRequiredQuantity: number;
  bomIds: Set<string>;
  productIds: Set<string>;
  hasNullUnitCost: boolean;
  totalEstimatedCost: number;
  unitCostCandidates: Set<number>;
  colorBreakdownMap: Map<string, number>;
  sizeBreakdownMap: Map<string, number>;
  colorSizeBreakdownMap: Map<string, ColorSizeAggItem>;
}

@Injectable()
export class BomAggregateService {
  constructor(
    @InjectRepository(Bom)
    private readonly bomRepository: Repository<Bom>,
    @InjectRepository(BomRevision)
    private readonly bomRevisionRepository: Repository<BomRevision>,
    @InjectRepository(BomLine)
    private readonly bomLineRepository: Repository<BomLine>,
    @InjectRepository(PurchaseOrderProduct)
    private readonly poProductRepository: Repository<PurchaseOrderProduct>,
    @InjectRepository(PurchaseOrderProductColor)
    private readonly poColorRepository: Repository<PurchaseOrderProductColor>,
    @InjectRepository(PurchaseOrderProductColorSize)
    private readonly poColorSizeRepository: Repository<PurchaseOrderProductColorSize>,
    private readonly bomCostService: BomCostService,
  ) {}

  /**
   * Aggregates material requirements across all eligible PO BOMs.
   *
   * Business Rules:
   * 1. Eligibility: Only active PO BOMs (bom_type = 'po', discontinued_at IS NULL)
   *    whose current_revision_id is in status 'closed'.
   * 2. Exclusions: Fit BOMs, in-progress PO BOMs (wait_*), discontinued BOMs,
   *    and historical revisions (not current) are strictly excluded.
   * 3. Dynamic Quantity: Computed live from purchase_order_product_color_sizes.quantity.
   *    Never uses order_quantity_snapshot.
   * 4. Formula: requiredQuantity = consumption * currentOrderQuantity.
   * 5. Grouping: Grouped by materialId and unitSnapshot to preserve unit context.
   * 6. Snapshots: Historical snapshots from BOM lines are preserved.
   * 7. Anti-N+1: Executes at most 3 bulk queries for any number of BOMs.
   * 8. Cost Masking: Masked for NVKH/RD; incomplete costs evaluate to null.
   */
  async aggregate(
    query: QueryBomAggregateDto,
    userRole?: string | null,
  ): Promise<PaginatedResult<BomAggregateItemDto>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(100, query.limit ?? 20));

    // ─── Query 1: Find Eligible PO BOMs matching filters ──────────────────────
    const bomQb = this.bomRepository.createQueryBuilder('bom');

    // Join current revision
    bomQb.innerJoin(
      'bom_revisions',
      'rev',
      'bom.current_revision_id = rev.id AND rev.status = :closedStatus',
      { closedStatus: BomRevisionStatus.CLOSED },
    );

    // Join PO Product
    bomQb.innerJoin(
      'purchase_order_products',
      'pop',
      'bom.purchase_order_product_id = pop.id',
    );

    // Join PO for filtering
    bomQb.innerJoin('purchase_orders', 'po', 'pop.purchase_order_id = po.id');

    // Join Style for filtering
    bomQb.leftJoin('styles', 'style', 'pop.source_style_id = style.id');

    // Base Eligibility: Type PO, Not Discontinued, Has Current Revision & PO Product
    bomQb.where('bom.bom_type = :bomType', { bomType: BomType.PO });
    bomQb.andWhere('bom.discontinued_at IS NULL');
    bomQb.andWhere('bom.current_revision_id IS NOT NULL');
    bomQb.andWhere('bom.purchase_order_product_id IS NOT NULL');

    // Filters
    if (query.bomId) {
      const term = query.bomId.trim();
      bomQb.andWhere('(bom.id::text = :bomId OR bom.bom_code ILIKE :bomCode)', {
        bomId: term,
        bomCode: `%${term}%`,
      });
    }

    if (query.purchaseOrderId) {
      const term = query.purchaseOrderId.trim();
      bomQb.andWhere('(po.id::text = :poId OR po.po_code ILIKE :poCode)', {
        poId: term,
        poCode: `%${term}%`,
      });
    } else if (query.purchaseOrder) {
      const term = query.purchaseOrder.trim();
      bomQb.andWhere('(po.po_code ILIKE :poCode OR po.id::text = :poId)', {
        poCode: `%${term}%`,
        poId: term,
      });
    }

    if (query.purchaseOrderProductId) {
      const term = query.purchaseOrderProductId.trim();
      bomQb.andWhere(
        '(pop.id::text = :popId OR pop.product_code ILIKE :popCode)',
        {
          popId: term,
          popCode: `%${term}%`,
        },
      );
    } else if (query.product) {
      const term = query.product.trim();
      bomQb.andWhere(
        '(pop.product_code ILIKE :prodCode OR pop.product_name ILIKE :prodName OR pop.id::text = :prodId)',
        {
          prodCode: `%${term}%`,
          prodName: `%${term}%`,
          prodId: term,
        },
      );
    }

    if (query.styleId) {
      const term = query.styleId.trim();
      bomQb.andWhere(
        '(pop.source_style_id::text = :styleId OR style.style_code ILIKE :styleCode)',
        {
          styleId: term,
          styleCode: `%${term}%`,
        },
      );
    } else if (query.style) {
      const term = query.style.trim();
      bomQb.andWhere(
        '(style.style_code ILIKE :styleCode OR style.style_name ILIKE :styleName OR pop.source_style_id::text = :styleId)',
        {
          styleCode: `%${term}%`,
          styleName: `%${term}%`,
          styleId: term,
        },
      );
    }

    bomQb.select([
      'bom.id',
      'bom.purchaseOrderProductId',
      'bom.currentRevisionId',
    ]);

    const eligibleBoms = await bomQb.getMany();

    if (eligibleBoms.length === 0) {
      return {
        data: [],
        meta: {
          total: 0,
          page,
          limit,
          totalPages: 0,
          totalBoms: 0,
          totalProducts: 0,
          totalPurchaseOrders: 0,
        },
      };
    }

    // ─── Query 2: Bulk fetch live Color & Size quantities (1 Query) ───────────
    const poProductIds = Array.from(
      new Set(
        eligibleBoms
          .map((b) => b.purchaseOrderProductId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    // Fetch PO IDs for the eligible products (for meta.totalPurchaseOrders)
    let poIdSet = new Set<string>();
    if (poProductIds.length > 0) {
      const poIdRows = await this.poProductRepository
        .createQueryBuilder('pop')
        .select('pop.purchase_order_id', 'poId')
        .where('pop.id IN (:...poProductIds)', { poProductIds })
        .distinct(true)
        .getRawMany<{ poId: string }>();
      poIdSet = new Set(poIdRows.map((r) => r.poId).filter(Boolean));
    }

    const productTotalQtyMap = new Map<string, number>();
    const productBreakdownMap = new Map<
      string,
      Array<{
        productId: string;
        productCode: string;
        productName: string;
        colorName: string;
        sizeLabel: string;
        quantity: number;
      }>
    >();

    if (poProductIds.length > 0) {
      const colorSizeRows = await this.poColorSizeRepository
        .createQueryBuilder('cs')
        .innerJoin(PurchaseOrderProductColor, 'c', 'cs.product_color_id = c.id')
        .innerJoin(PurchaseOrderProduct, 'pop', 'c.product_id = pop.id')
        .where('c.product_id IN (:...poProductIds)', { poProductIds })
        .select('c.product_id', 'productId')
        .addSelect('pop.product_code', 'productCode')
        .addSelect('pop.product_name', 'productName')
        .addSelect('c.color_name', 'colorName')
        .addSelect('cs.size_label', 'sizeLabel')
        .addSelect('SUM(cs.quantity)::int', 'quantity')
        .groupBy('c.product_id')
        .addGroupBy('pop.product_code')
        .addGroupBy('pop.product_name')
        .addGroupBy('c.color_name')
        .addGroupBy('cs.size_label')
        .getRawMany<{
          productId: string;
          productCode?: string;
          productName?: string;
          colorName: string;
          sizeLabel: string;
          quantity: number;
        }>();

      for (const row of colorSizeRows) {
        const qty = Number(row.quantity) || 0;
        // Total product quantity
        productTotalQtyMap.set(
          row.productId,
          (productTotalQtyMap.get(row.productId) || 0) + qty,
        );

        // Breakdown items per product
        if (!productBreakdownMap.has(row.productId)) {
          productBreakdownMap.set(row.productId, []);
        }
        productBreakdownMap.get(row.productId)!.push({
          productId: row.productId,
          productCode: row.productCode || row.productId,
          productName: row.productName || row.productCode || '',
          colorName: row.colorName,
          sizeLabel: row.sizeLabel,
          quantity: qty,
        });
      }
    }

    // ─── Query 3: Bulk fetch lines from eligible current revisions (1 Query) ──
    const currentRevisionIds = Array.from(
      new Set(
        eligibleBoms
          .map((b) => b.currentRevisionId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const revToBomsMap = new Map<string, Bom[]>();
    for (const b of eligibleBoms) {
      if (b.currentRevisionId) {
        if (!revToBomsMap.has(b.currentRevisionId)) {
          revToBomsMap.set(b.currentRevisionId, []);
        }
        revToBomsMap.get(b.currentRevisionId)!.push(b);
      }
    }

    const lineQb = this.bomLineRepository
      .createQueryBuilder('line')
      .where('line.revision_id IN (:...currentRevisionIds)', {
        currentRevisionIds,
      })
      .orderBy('line.order_index', 'ASC');

    if (query.materialId) {
      lineQb.andWhere('line.material_id = :materialId', {
        materialId: query.materialId,
      });
    }

    if (query.search) {
      const s = query.search.trim();
      lineQb.andWhere(
        '(line.material_name_snapshot ILIKE :search OR line.material_group_snapshot ILIKE :search)',
        { search: `%${s}%` },
      );
    }

    const lines = await lineQb.getMany();

    // ─── Step 4: In-Memory Aggregation & Grouping ─────────────────────────────
    const breakdownType = query.breakdown ?? AggregateBreakdownType.NONE;
    const groupsMap = new Map<string, MaterialAggregator>();

    for (const line of lines) {
      if (!line.materialId) continue;

      const associatedBoms = revToBomsMap.get(line.revisionId) || [];
      const consumption = Number(line.consumption) || 0;

      for (const bom of associatedBoms) {
        const productId = bom.purchaseOrderProductId;
        if (!productId) continue;

        const productLiveQty = productTotalQtyMap.get(productId) || 0;
        const lineRequiredQty = consumption * productLiveQty;

        // Grouping key: materialId + unitSnapshot to avoid invalid unit mixing
        const groupKey = `${line.materialId}__${line.unitSnapshot}`;

        if (!groupsMap.has(groupKey)) {
          groupsMap.set(groupKey, {
            materialId: line.materialId,
            materialNameSnapshot: line.materialNameSnapshot,
            materialGroupSnapshot: line.materialGroupSnapshot,
            unitSnapshot: line.unitSnapshot,
            totalRequiredQuantity: 0,
            bomIds: new Set<string>(),
            productIds: new Set<string>(),
            hasNullUnitCost: false,
            totalEstimatedCost: 0,
            unitCostCandidates: new Set<number>(),
            colorBreakdownMap: new Map<string, number>(),
            sizeBreakdownMap: new Map<string, number>(),
            colorSizeBreakdownMap: new Map<string, ColorSizeAggItem>(),
          });
        }

        const agg = groupsMap.get(groupKey)!;
        agg.totalRequiredQuantity += lineRequiredQty;
        agg.bomIds.add(bom.id);
        agg.productIds.add(productId);

        // Unit Cost evaluation
        if (line.unitCost === null || line.unitCost === undefined) {
          agg.hasNullUnitCost = true;
        } else {
          const costVal = Number(line.unitCost);
          agg.unitCostCandidates.add(costVal);
          agg.totalEstimatedCost += lineRequiredQty * costVal;
        }

        // Breakdown calculation
        if (breakdownType !== AggregateBreakdownType.NONE) {
          const productBreakdownRows = productBreakdownMap.get(productId) || [];
          for (const row of productBreakdownRows) {
            const subRequired = consumption * Number(row.quantity);

            if (
              breakdownType === AggregateBreakdownType.COLOR ||
              breakdownType === AggregateBreakdownType.COLOR_SIZE
            ) {
              const currentVal = agg.colorBreakdownMap.get(row.colorName) || 0;
              agg.colorBreakdownMap.set(
                row.colorName,
                currentVal + subRequired,
              );
            }

            if (
              breakdownType === AggregateBreakdownType.SIZE ||
              breakdownType === AggregateBreakdownType.COLOR_SIZE
            ) {
              const currentVal = agg.sizeBreakdownMap.get(row.sizeLabel) || 0;
              agg.sizeBreakdownMap.set(row.sizeLabel, currentVal + subRequired);
            }

            if (breakdownType === AggregateBreakdownType.COLOR_SIZE) {
              const prodCode = row.productCode || row.productId;
              const prodName = row.productName || prodCode;
              const csKey = `${row.productId}__${row.colorName}__${row.sizeLabel}`;
              const existing = agg.colorSizeBreakdownMap.get(csKey);
              if (existing) {
                existing.quantity += subRequired;
              } else {
                agg.colorSizeBreakdownMap.set(csKey, {
                  productId: row.productId,
                  productCode: prodCode,
                  productName: prodName,
                  colorName: row.colorName,
                  sizeLabel: row.sizeLabel,
                  quantity: subRequired,
                });
              }
            }
          }
        }
      }
    }

    // ─── Step 5: Format Response Items & Apply Role Cost Masking ───────────────
    const isCostVisible = this.bomCostService.isCostVisible(userRole);
    const allItems: BomAggregateItemDto[] = [];

    for (const agg of groupsMap.values()) {
      const roundedQuantity =
        Math.round((agg.totalRequiredQuantity + Number.EPSILON) * 10000) /
        10000;

      let unitCost: number | null = null;
      let totalEstimatedCost: number | null = null;
      const costComplete = !agg.hasNullUnitCost;

      if (isCostVisible) {
        if (!agg.hasNullUnitCost) {
          totalEstimatedCost =
            Math.round((agg.totalEstimatedCost + Number.EPSILON) * 100) / 100;
          if (agg.unitCostCandidates.size === 1) {
            unitCost = Array.from(agg.unitCostCandidates)[0];
          }
        }
      }

      // Format breakdown array if requested
      let breakdown: AggregateBreakdownItemDto[] | undefined = undefined;

      if (breakdownType === AggregateBreakdownType.COLOR) {
        breakdown = Array.from(agg.colorBreakdownMap.entries()).map(
          ([colorName, qty]) => ({
            colorName,
            requiredQuantity:
              Math.round((qty + Number.EPSILON) * 10000) / 10000,
          }),
        );
      } else if (breakdownType === AggregateBreakdownType.SIZE) {
        breakdown = Array.from(agg.sizeBreakdownMap.entries()).map(
          ([sizeLabel, qty]) => ({
            sizeLabel,
            requiredQuantity:
              Math.round((qty + Number.EPSILON) * 10000) / 10000,
          }),
        );
      } else if (breakdownType === AggregateBreakdownType.COLOR_SIZE) {
        breakdown = Array.from(agg.colorSizeBreakdownMap.values()).map(
          (item) => ({
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            colorName: item.colorName,
            sizeLabel: item.sizeLabel,
            requiredQuantity:
              Math.round((item.quantity + Number.EPSILON) * 10000) / 10000,
          }),
        );
      }

      allItems.push({
        materialId: agg.materialId,
        materialNameSnapshot: agg.materialNameSnapshot,
        materialGroupSnapshot: agg.materialGroupSnapshot,
        unitSnapshot: agg.unitSnapshot,
        totalRequiredQuantity: roundedQuantity,
        bomCount: agg.bomIds.size,
        poProductCount: agg.productIds.size,
        unitCost,
        totalEstimatedCost,
        costComplete,
        breakdown,
      });
    }

    // Sort materials deterministically by materialNameSnapshot ASC
    allItems.sort((a, b) =>
      a.materialNameSnapshot.localeCompare(b.materialNameSnapshot),
    );

    // ─── Step 6: Pagination ───────────────────────────────────────────────────
    const total = allItems.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const pagedData = allItems.slice(skip, skip + limit);

    return {
      data: pagedData,
      meta: {
        total,
        page,
        limit,
        totalPages,
        totalBoms: eligibleBoms.length,
        totalProducts: poProductIds.length,
        totalPurchaseOrders: poIdSet.size,
      },
    };
  }
}
