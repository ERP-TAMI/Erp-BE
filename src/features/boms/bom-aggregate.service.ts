import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Bom } from './entities/Bom.entity';
import { BomRevision } from './entities/BomRevision.entity';
import { BomLine } from './entities/BomLine.entity';
import { PurchaseOrder } from '../purchase-orders/entities/PurchaseOrder.entity';
import { PurchaseOrderProduct } from '../purchase-orders/entities/PurchaseOrderProduct.entity';
import { PurchaseOrderProductColor } from '../purchase-orders/entities/PurchaseOrderProductColor.entity';
import { PurchaseOrderProductColorSize } from '../purchase-orders/entities/PurchaseOrderProductColorSize.entity';
import { Material } from '../master-data/entities/Material.entity';
import { Style } from '../styles/entities/Style.entity';
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

type AggregateGroupRow = {
  materialId: string;
  materialCode: string | null;
  materialNameSnapshot: string;
  materialGroupSnapshot: string | null;
  unitSnapshot: string;
  totalRequiredQuantity: string | number;
  bomCount: string | number;
  poProductCount: string | number;
  hasNullUnitCost: boolean | string;
  totalEstimatedCost: string | number;
  minUnitCost: string | number | null;
  maxUnitCost: string | number | null;
  totalGroups: string | number;
};

type BreakdownRow = {
  materialId: string;
  unitSnapshot: string;
  requiredQuantity: string | number;
  productId?: string;
  productCode?: string;
  productName?: string;
  colorName?: string;
  sizeLabel?: string;
};

@Injectable()
export class BomAggregateService {
  constructor(
    @InjectRepository(Bom)
    private readonly bomRepository: Repository<Bom>,
    private readonly bomCostService: BomCostService,
  ) {}

  private createEligibleBomQuery(
    query: QueryBomAggregateDto,
  ): SelectQueryBuilder<Bom> {
    const qb = this.bomRepository
      .createQueryBuilder('bom')
      .innerJoin(
        BomRevision,
        'rev',
        'rev.id = bom.current_revision_id AND rev.status = :closedStatus',
        { closedStatus: BomRevisionStatus.CLOSED },
      )
      .innerJoin(
        PurchaseOrderProduct,
        'pop',
        'bom.purchase_order_product_id = pop.id',
      )
      .innerJoin(PurchaseOrder, 'po', 'pop.purchase_order_id = po.id')
      .leftJoin(Style, 'style', 'pop.source_style_id = style.id')
      .where('bom.bom_type = :bomType', { bomType: BomType.PO })
      .andWhere('bom.discontinued_at IS NULL')
      .andWhere('bom.current_revision_id IS NOT NULL')
      .andWhere('bom.purchase_order_product_id IS NOT NULL');

    if (query.bomId?.trim()) {
      const term = query.bomId.trim();
      qb.andWhere('(bom.id::text = :bomId OR bom.bom_code ILIKE :bomCode)', {
        bomId: term,
        bomCode: `%${term}%`,
      });
    }

    if (query.purchaseOrderId?.trim()) {
      const term = query.purchaseOrderId.trim();
      qb.andWhere('(po.id::text = :poId OR po.po_code ILIKE :poCode)', {
        poId: term,
        poCode: `%${term}%`,
      });
    } else if (query.purchaseOrder?.trim()) {
      const term = query.purchaseOrder.trim();
      qb.andWhere('(po.po_code ILIKE :poCode OR po.id::text = :poId)', {
        poCode: `%${term}%`,
        poId: term,
      });
    }

    if (query.purchaseOrderProductId?.trim()) {
      const term = query.purchaseOrderProductId.trim();
      qb.andWhere(
        '(pop.id::text = :popId OR pop.product_code ILIKE :popCode)',
        {
          popId: term,
          popCode: `%${term}%`,
        },
      );
    } else if (query.product?.trim()) {
      const term = query.product.trim();
      qb.andWhere(
        '(pop.product_code ILIKE :prodCode OR pop.product_name ILIKE :prodName OR pop.id::text = :prodId)',
        {
          prodCode: `%${term}%`,
          prodName: `%${term}%`,
          prodId: term,
        },
      );
    }

    if (query.styleId?.trim()) {
      const term = query.styleId.trim();
      qb.andWhere(
        '(pop.source_style_id::text = :styleId OR style.style_code ILIKE :styleCode)',
        {
          styleId: term,
          styleCode: `%${term}%`,
        },
      );
    } else if (query.style?.trim()) {
      const term = query.style.trim();
      qb.andWhere(
        '(style.style_code ILIKE :styleCode OR style.style_name ILIKE :styleName OR pop.source_style_id::text = :styleId)',
        {
          styleCode: `%${term}%`,
          styleName: `%${term}%`,
          styleId: term,
        },
      );
    }

    return qb;
  }

  private applyLineFilters(
    qb: SelectQueryBuilder<Bom>,
    query: QueryBomAggregateDto,
    lineAlias = 'line',
  ): void {
    if (query.materialId?.trim()) {
      qb.andWhere(`${lineAlias}.material_id = :materialId`, {
        materialId: query.materialId.trim(),
      });
    }

    if (query.search?.trim()) {
      qb.andWhere(
        `(${lineAlias}.material_name_snapshot ILIKE :materialSearch OR ${lineAlias}.material_group_snapshot ILIKE :materialSearch)`,
        { materialSearch: `%${query.search.trim()}%` },
      );
    }
  }

  async aggregate(
    query: QueryBomAggregateDto,
    userRole?: string | null,
  ): Promise<PaginatedResult<BomAggregateItemDto>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(100, query.limit ?? 20));
    const skip = (page - 1) * limit;
    const eligibleQb = this.createEligibleBomQuery(query);

    const statsQb = eligibleQb
      .clone()
      .select('COUNT(DISTINCT bom.id)', 'totalBoms')
      .addSelect('COUNT(DISTINCT pop.id)', 'totalProducts')
      .addSelect('COUNT(DISTINCT po.id)', 'totalPurchaseOrders');

    const isCostVisible = this.bomCostService.isCostVisible(userRole);
    const groupQb = eligibleQb
      .clone()
      .innerJoin(BomLine, 'line', 'line.revision_id = rev.id')
      .leftJoin(Material, 'material', 'material.id = line.material_id')
      .leftJoin(PurchaseOrderProductColor, 'color', 'color.product_id = pop.id')
      .leftJoin(
        PurchaseOrderProductColorSize,
        'cs',
        'cs.product_color_id = color.id',
      )
      .andWhere('line.material_id IS NOT NULL');
    this.applyLineFilters(groupQb, query);

    groupQb
      .select('line.material_id', 'materialId')
      .addSelect('material.material_code', 'materialCode')
      .addSelect('MIN(line.material_name_snapshot)', 'materialNameSnapshot')
      .addSelect('MIN(line.material_group_snapshot)', 'materialGroupSnapshot')
      .addSelect('line.unit_snapshot', 'unitSnapshot')
      .addSelect(
        'SUM(line.consumption * COALESCE(cs.quantity, 0))',
        'totalRequiredQuantity',
      )
      .addSelect('COUNT(DISTINCT bom.id)', 'bomCount')
      .addSelect('COUNT(DISTINCT pop.id)', 'poProductCount')
      .addSelect('BOOL_OR(line.unit_cost IS NULL)', 'hasNullUnitCost')
      .addSelect(
        'SUM(line.consumption * COALESCE(cs.quantity, 0) * COALESCE(line.unit_cost, 0))',
        'totalEstimatedCost',
      )
      .addSelect('MIN(line.unit_cost)', 'minUnitCost')
      .addSelect('MAX(line.unit_cost)', 'maxUnitCost')
      .addSelect('COUNT(*) OVER()', 'totalGroups')
      .groupBy('line.material_id')
      .addGroupBy('material.material_code')
      .addGroupBy('line.unit_snapshot')
      .orderBy('line.material_name_snapshot', 'ASC')
      .addOrderBy('line.material_id', 'ASC')
      .addOrderBy('line.unit_snapshot', 'ASC')
      .offset(skip)
      .limit(limit);

    const [stats, pageRows] = await Promise.all([
      statsQb.getRawOne<{
        totalBoms: string | number;
        totalProducts: string | number;
        totalPurchaseOrders: string | number;
      }>(),
      groupQb.getRawMany<AggregateGroupRow>(),
    ]);

    const totalBoms = Number(stats?.totalBoms) || 0;
    const totalProducts = Number(stats?.totalProducts) || 0;
    const totalPurchaseOrders = Number(stats?.totalPurchaseOrders) || 0;

    let total = Number(pageRows[0]?.totalGroups) || 0;
    if (pageRows.length === 0 && totalBoms > 0) {
      const countQb = eligibleQb
        .clone()
        .innerJoin(BomLine, 'line', 'line.revision_id = rev.id')
        .andWhere('line.material_id IS NOT NULL');
      this.applyLineFilters(countQb, query);
      const groupCount = await countQb
        .select(
          'COUNT(DISTINCT (line.material_id, line.unit_snapshot))',
          'totalGroups',
        )
        .getRawOne<{ totalGroups: string | number }>();
      total = Number(groupCount?.totalGroups) || 0;
    }

    if (totalBoms === 0 || total === 0) {
      return {
        data: [],
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          totalBoms,
          totalProducts,
          totalPurchaseOrders,
        },
      };
    }

    const breakdownType = query.breakdown ?? AggregateBreakdownType.NONE;
    const breakdownByGroup = new Map<string, AggregateBreakdownItemDto[]>();
    if (breakdownType !== AggregateBreakdownType.NONE && pageRows.length > 0) {
      const breakdownQb = eligibleQb
        .clone()
        .innerJoin(BomLine, 'line', 'line.revision_id = rev.id')
        .innerJoin(
          PurchaseOrderProductColor,
          'color',
          'color.product_id = pop.id',
        )
        .innerJoin(
          PurchaseOrderProductColorSize,
          'cs',
          'cs.product_color_id = color.id',
        )
        .andWhere('line.material_id IS NOT NULL');
      this.applyLineFilters(breakdownQb, query);

      const groupConditions: string[] = [];
      const groupParams: Record<string, unknown> = {};
      pageRows.forEach((row, index) => {
        const materialParam = `pageMaterial${index}`;
        const unitParam = `pageUnit${index}`;
        groupConditions.push(
          `(line.material_id = :${materialParam} AND line.unit_snapshot = :${unitParam})`,
        );
        groupParams[materialParam] = row.materialId;
        groupParams[unitParam] = row.unitSnapshot;
      });
      breakdownQb.andWhere(`(${groupConditions.join(' OR ')})`, groupParams);

      breakdownQb
        .select('line.material_id', 'materialId')
        .addSelect('line.unit_snapshot', 'unitSnapshot')
        .addSelect('SUM(line.consumption * cs.quantity)', 'requiredQuantity');

      if (
        breakdownType === AggregateBreakdownType.COLOR ||
        breakdownType === AggregateBreakdownType.COLOR_SIZE
      ) {
        breakdownQb.addSelect('color.color_name', 'colorName');
        breakdownQb.addGroupBy('color.color_name');
      }

      if (
        breakdownType === AggregateBreakdownType.SIZE ||
        breakdownType === AggregateBreakdownType.COLOR_SIZE
      ) {
        breakdownQb.addSelect('cs.size_label', 'sizeLabel');
        breakdownQb.addGroupBy('cs.size_label');
      }

      if (breakdownType === AggregateBreakdownType.COLOR_SIZE) {
        breakdownQb
          .addSelect('pop.id', 'productId')
          .addSelect('pop.product_code', 'productCode')
          .addSelect('pop.product_name', 'productName')
          .addGroupBy('pop.id')
          .addGroupBy('pop.product_code')
          .addGroupBy('pop.product_name');
      }

      breakdownQb.groupBy('line.material_id').addGroupBy('line.unit_snapshot');

      const breakdownRows = await breakdownQb.getRawMany<BreakdownRow>();
      for (const row of breakdownRows) {
        const groupKey = this.groupKey(row);
        const requiredQuantity = this.roundQuantity(
          Number(row.requiredQuantity) || 0,
        );
        let item: AggregateBreakdownItemDto;

        if (breakdownType === AggregateBreakdownType.COLOR) {
          item = { colorName: row.colorName, requiredQuantity };
        } else if (breakdownType === AggregateBreakdownType.SIZE) {
          item = { sizeLabel: row.sizeLabel, requiredQuantity };
        } else {
          item = {
            productId: row.productId,
            productCode: row.productCode || row.productId,
            productName: row.productName || row.productCode || '',
            colorName: row.colorName,
            sizeLabel: row.sizeLabel,
            requiredQuantity,
          };
        }

        const list = breakdownByGroup.get(groupKey) ?? [];
        list.push(item);
        breakdownByGroup.set(groupKey, list);
      }
    }

    const data = pageRows.map((row) => {
      const hasNullUnitCost =
        row.hasNullUnitCost === true || row.hasNullUnitCost === 'true';
      const minUnitCost =
        row.minUnitCost === null ? null : Number(row.minUnitCost);
      const maxUnitCost =
        row.maxUnitCost === null ? null : Number(row.maxUnitCost);
      const costComplete = !hasNullUnitCost;
      const groupKey = this.groupKey(row);

      return {
        materialId: row.materialId,
        materialCode: row.materialCode,
        materialNameSnapshot: row.materialNameSnapshot,
        materialGroupSnapshot: row.materialGroupSnapshot,
        unitSnapshot: row.unitSnapshot,
        totalRequiredQuantity: this.roundQuantity(
          Number(row.totalRequiredQuantity) || 0,
        ),
        bomCount: Number(row.bomCount) || 0,
        poProductCount: Number(row.poProductCount) || 0,
        unitCost:
          isCostVisible &&
          costComplete &&
          minUnitCost !== null &&
          minUnitCost === maxUnitCost
            ? minUnitCost
            : null,
        totalEstimatedCost:
          isCostVisible && costComplete
            ? this.roundCost(Number(row.totalEstimatedCost) || 0)
            : null,
        costComplete,
        breakdown: breakdownByGroup.get(groupKey),
      } satisfies BomAggregateItemDto;
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalBoms,
        totalProducts,
        totalPurchaseOrders,
      },
    };
  }

  private groupKey(group: {
    materialId: string;
    unitSnapshot: string;
  }): string {
    return JSON.stringify([group.materialId, group.unitSnapshot]);
  }

  private roundQuantity(value: number): number {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
  }

  private roundCost(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
