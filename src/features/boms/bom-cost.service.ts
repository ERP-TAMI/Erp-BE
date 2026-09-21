import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BomLine } from './entities/BomLine.entity';
import { PurchaseOrderProductColorSize } from '../purchase-orders/entities/PurchaseOrderProductColorSize.entity';
import { PurchaseOrderProductColor } from '../purchase-orders/entities/PurchaseOrderProductColor.entity';
import { BomType } from '../../common/enums/database.enums';

export const COST_VISIBLE_ROLES = new Set(['SA', 'TPKH', 'ACCOUNTING']);

@Injectable()
export class BomCostService {
  constructor(
    @InjectRepository(BomLine)
    private readonly bomLineRepository: Repository<BomLine>,
    @InjectRepository(PurchaseOrderProductColorSize)
    private readonly poColorSizeRepository: Repository<PurchaseOrderProductColorSize>,
    @InjectRepository(PurchaseOrderProductColor)
    private readonly poColorRepository: Repository<PurchaseOrderProductColor>,
  ) {}

  /**
   * Checks if the given user role code is authorized to view costs.
   * Authorized roles: SA, TPKH, ACCOUNTING.
   * Unauthorized roles: NVKH, RD, IT, etc.
   */
  isCostVisible(roleCode?: string | null): boolean {
    if (!roleCode) return false;
    return COST_VISIBLE_ROLES.has(roleCode.trim().toUpperCase());
  }

  /**
   * Calculates cost per unit from a list of BOM lines:
   * costPerUnit = SUM(consumption * unit_cost)
   *
   * Business Rules:
   * - unit_cost = NULL -> price not entered yet -> total cost is incomplete -> returns null.
   * - unit_cost = 0 -> valid price equal to 0 -> contributes 0.
   * - empty lines -> returns null.
   * - Never convert NULL to 0.
   * - Avoid JS floating point issues with safe 2-decimal precision.
   */
  calculateCostPerUnit(lines?: BomLine[] | null): number | null {
    if (!lines || lines.length === 0) {
      return null;
    }

    let total = 0;
    for (const line of lines) {
      if (line.unitCost === null || line.unitCost === undefined) {
        // Price is not yet entered for this material -> cost data is incomplete
        return null;
      }

      const consumption = Number(line.consumption) || 0;
      const unitCost = Number(line.unitCost);
      total += consumption * unitCost;
    }

    return Math.round((total + Number.EPSILON) * 10000) / 10000;
  }

  /**
   * Calculates line cost for a single BOM line:
   * line_cost = consumption * unit_cost
   * Returns null if unit_cost is null.
   */
  calculateLineCost(line: BomLine): number | null {
    if (line.unitCost === null || line.unitCost === undefined) {
      return null;
    }
    const consumption = Number(line.consumption) || 0;
    const unitCost = Number(line.unitCost);
    return (
      Math.round((consumption * unitCost + Number.EPSILON) * 10000) / 10000
    );
  }

  /**
   * Bulk calculates costPerUnit for multiple revision IDs in a single query (prevents N+1).
   */
  async calculateCostPerUnits(
    revisionIds: string[],
  ): Promise<Map<string, number | null>> {
    const resultMap = new Map<string, number | null>();
    if (!revisionIds || revisionIds.length === 0) {
      return resultMap;
    }

    const rows = await this.bomLineRepository
      .createQueryBuilder('l')
      .select('l.revision_id', 'revisionId')
      .addSelect('SUM(l.consumption * l.unit_cost)', 'totalCost')
      .addSelect(
        'COUNT(CASE WHEN l.unit_cost IS NULL THEN 1 END)::int',
        'nullCostCount',
      )
      .addSelect('COUNT(*)::int', 'lineCount')
      .where('l.revision_id IN (:...revisionIds)', { revisionIds })
      .groupBy('l.revision_id')
      .getRawMany<{
        revisionId: string;
        totalCost: string | null;
        nullCostCount: number;
        lineCount: number;
      }>();

    for (const r of rows) {
      if (Number(r.lineCount) === 0 || Number(r.nullCostCount) > 0) {
        resultMap.set(r.revisionId, null);
      } else {
        const total = Number(r.totalCost) || 0;
        resultMap.set(
          r.revisionId,
          Math.round((total + Number.EPSILON) * 10000) / 10000,
        );
      }
    }

    return resultMap;
  }

  /**
   * Calculates current order quantity dynamically from live PO product color sizes.
   * Formula: SUM(cs.quantity) for all colors of the product in the PO.
   * Does NOT read order_quantity_snapshot from BOM.
   */
  async calculateCurrentOrderQuantity(
    purchaseOrderProductId: string,
  ): Promise<number> {
    if (!purchaseOrderProductId) return 0;

    const raw = await this.poColorSizeRepository
      .createQueryBuilder('cs')
      .innerJoin(PurchaseOrderProductColor, 'c', 'cs.product_color_id = c.id')
      .where('c.product_id = :purchaseOrderProductId', {
        purchaseOrderProductId,
      })
      .select('COALESCE(SUM(cs.quantity), 0)::int', 'totalQuantity')
      .getRawOne<{ totalQuantity: number }>();

    return raw ? Number(raw.totalQuantity) : 0;
  }

  /**
   * Bulk calculates current order quantity for multiple PO products in a single query (prevents N+1).
   */
  async calculateCurrentOrderQuantities(
    purchaseOrderProductIds: string[],
  ): Promise<Map<string, number>> {
    const resultMap = new Map<string, number>();
    if (!purchaseOrderProductIds || purchaseOrderProductIds.length === 0) {
      return resultMap;
    }

    const rows = await this.poColorSizeRepository
      .createQueryBuilder('cs')
      .innerJoin(PurchaseOrderProductColor, 'c', 'cs.product_color_id = c.id')
      .where('c.product_id IN (:...purchaseOrderProductIds)', {
        purchaseOrderProductIds,
      })
      .select('c.product_id', 'productId')
      .addSelect('COALESCE(SUM(cs.quantity), 0)::int', 'totalQuantity')
      .groupBy('c.product_id')
      .getRawMany<{ productId: string; totalQuantity: number }>();

    for (const r of rows) {
      resultMap.set(r.productId, Number(r.totalQuantity) || 0);
    }

    return resultMap;
  }

  /**
   * Calculates currentOrderCost:
   * currentOrderCost = costPerUnit * currentOrderQuantity
   *
   * Business Rules:
   * - Fit BOM: returns null (no PO attached).
   * - PO BOM: returns costPerUnit * currentOrderQuantity.
   * - If costPerUnit is null or currentOrderQuantity is null: returns null.
   */
  calculateCurrentOrderCost(params: {
    bomType: BomType;
    costPerUnit: number | null;
    currentOrderQuantity: number | null;
  }): number | null {
    if (params.bomType === BomType.FIT) {
      return null;
    }

    if (
      params.costPerUnit === null ||
      params.costPerUnit === undefined ||
      params.currentOrderQuantity === null ||
      params.currentOrderQuantity === undefined
    ) {
      return null;
    }

    const cost = params.costPerUnit * params.currentOrderQuantity;
    return Math.round((cost + Number.EPSILON) * 10000) / 10000;
  }
}
