import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BillOfMaterials } from './entities/BillOfMaterials.entity';
import { BillOfMaterialLine } from './entities/BillOfMaterialLine.entity';
import { FitBomLine } from '../fit-boms/entities/FitBomLine.entity';
import { Style } from '../styles/entities/Style.entity';
import { StyleStatus } from '../../common/enums/database.enums';
import {
  QueryBomsDto,
  BomListItemDto,
  PaginatedBomResponseDto,
  BomStatsDto,
} from './dto';

const ALLOWED_COST_ROLES = new Set([
  'sa',
  'tpkh',
  'accounting',
  'kt',
  'ke_toan',
  'giam_doc',
  'director',
  'admin',
]);

export function isUserAllowedToViewCost(user?: any): boolean {
  const roleCode = user?.roleCode || user?.role;
  if (!roleCode) return false;
  return ALLOWED_COST_ROLES.has(String(roleCode).toLowerCase().trim());
}

export function normalizeStatusQuery(
  status: string | null | undefined,
): string {
  if (!status) return '';
  const s = status.trim().toLowerCase();
  switch (s) {
    case 'closed':
    case 'approved':
    case 'active':
      return 'approved';
    case 'wait_accounting':
    case 'wait_price':
      return 'wait_price';
    case 'wait_rd':
      return 'wait_rd';
    case 'wait_tpkh_confirm':
    case 'wait_tp_approve':
      return 'wait_tp_approve';
    case 'wait_sa_approve':
      return 'wait_sa_approve';
    case 'draft':
      return 'draft';
    case 'locked':
      return 'locked';
    default:
      return s;
  }
}

function mapBomStatusToLabel(status: string | null | undefined): string {
  if (!status) return 'Draft';
  switch (status.toLowerCase()) {
    case 'draft':
      return 'Draft';
    case 'wait_rd':
      return 'Wait_RD';
    case 'wait_accounting':
      return 'Wait_Price';
    case 'wait_tpkh_confirm':
      return 'Wait_TP_Approve';
    case 'wait_sa_approve':
      return 'Wait_SA_Approve';
    case 'closed':
    case 'approved':
      return 'Approved';
    default:
      return status;
  }
}

@Injectable()
export class BomsService {
  constructor(
    @InjectRepository(BillOfMaterials)
    private readonly bomRepo: Repository<BillOfMaterials>,
    @InjectRepository(BillOfMaterialLine)
    private readonly bomLineRepo: Repository<BillOfMaterialLine>,
    @InjectRepository(FitBomLine)
    private readonly fitBomLineRepo: Repository<FitBomLine>,
    @InjectRepository(Style)
    private readonly styleRepo: Repository<Style>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Fetch paginated BOMs (PO & Fit) with database-level UNION ALL, filtering, and role-based cost masking.
   */
  async findAll(
    query?: QueryBomsDto,
    user?: any,
  ): Promise<PaginatedBomResponseDto> {
    const canViewCost = isUserAllowedToViewCost(user);

    const shouldIncludePo =
      !query?.objectType ||
      query.objectType === 'all' ||
      query.objectType === 'po';
    const shouldIncludeFit =
      !query?.objectType ||
      query.objectType === 'all' ||
      query.objectType === 'fit';

    if (!shouldIncludePo && !shouldIncludeFit) {
      return {
        data: [],
        meta: {
          total: 0,
          page: query?.page ? Number(query.page) : 1,
          limit: query?.limit ? Number(query.limit) : 10,
          totalPages: 0,
        },
      };
    }

    const branches: string[] = [];

    if (shouldIncludePo) {
      branches.push(`
        SELECT
          bom.id::text as id,
          bom.bom_code,
          'po'::text as object_type,
          bom.po_code_snapshot as object_code,
          po.id::text as po_id,
          popc.id::text as color_id,
          bom.color_name_snapshot as color_name,
          bom.product_code_snapshot as style_code,
          bom.product_name_snapshot as product_name,
          bom.order_quantity_snapshot as po_quantity,
          bom.row_version as version,
          CASE bom.status::text
            WHEN 'closed' THEN 'Approved'
            WHEN 'wait_accounting' THEN 'Wait_Price'
            WHEN 'wait_rd' THEN 'Wait_RD'
            WHEN 'wait_tpkh_confirm' THEN 'Wait_TP_Approve'
            WHEN 'wait_sa_approve' THEN 'Wait_SA_Approve'
            ELSE 'Draft'
          END as status,
          cost_calc.total_cost,
          bom.deadline::text as deadline,
          bom.created_at
        FROM bills_of_materials bom
        LEFT JOIN purchase_order_product_colors popc ON popc.id = bom.product_color_id
        LEFT JOIN purchase_order_products pop ON pop.id = popc.product_id
        LEFT JOIN purchase_orders po ON po.id = pop.purchase_order_id
        LEFT JOIN (
          SELECT bill_of_material_id, SUM(consumption_per_unit * unit_cost) as total_cost
          FROM bill_of_material_lines
          GROUP BY bill_of_material_id
        ) cost_calc ON cost_calc.bill_of_material_id = bom.id
      `);
    }

    if (shouldIncludeFit) {
      branches.push(`
        SELECT
          s.id::text as id,
          ('FIT-' || s.style_code) as bom_code,
          'fit'::text as object_type,
          ('FIT-' || s.style_code) as object_code,
          ''::text as po_id,
          NULL::text as color_id,
          'Tiêu chuẩn'::text as color_name,
          s.style_code as style_code,
          s.style_name as product_name,
          NULL::integer as po_quantity,
          1 as version,
          CASE s.status::text
            WHEN 'active' THEN 'Approved'
            WHEN 'approved' THEN 'Approved'
            ELSE 'Draft'
          END as status,
          NULL::numeric as total_cost,
          NULL::text as deadline,
          s.created_at
        FROM styles s
      `);
    }

    const baseUnionSql = branches.join(' UNION ALL ');

    const params: any[] = [];
    let paramIdx = 1;
    const whereClauses: string[] = [];

    if (query?.status) {
      const normalizedStatus = normalizeStatusQuery(query.status);
      whereClauses.push(`LOWER(combined.status) = LOWER($${paramIdx++})`);
      params.push(normalizedStatus);
    }

    if (query?.poCode) {
      whereClauses.push(
        `(combined.object_code ILIKE $${paramIdx} OR combined.po_id ILIKE $${paramIdx})`,
      );
      params.push(`%${query.poCode}%`);
      paramIdx++;
    }

    if (query?.search) {
      whereClauses.push(
        `(combined.style_code ILIKE $${paramIdx} OR combined.product_name ILIKE $${paramIdx} OR combined.object_code ILIKE $${paramIdx})`,
      );
      params.push(`%${query.search}%`);
      paramIdx++;
    }

    if (query?.colorName) {
      whereClauses.push(`combined.color_name ILIKE $${paramIdx++}`);
      params.push(`%${query.colorName}%`);
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) as count FROM (${baseUnionSql}) combined ${whereSql}`;
    const countResult = await this.dataSource.query(countSql, params);
    const total = parseInt(countResult[0]?.count || '0', 10);

    const page = query?.page && query.page > 0 ? Number(query.page) : 1;
    const limit = query?.limit && query.limit > 0 ? Number(query.limit) : 10;
    const offset = (page - 1) * limit;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const pagedSql = `
      SELECT
        combined.id,
        combined.bom_code,
        combined.object_type,
        combined.object_code,
        combined.po_id,
        combined.color_id,
        combined.color_name,
        combined.style_code,
        combined.product_name,
        combined.po_quantity,
        combined.version,
        combined.status,
        combined.total_cost,
        combined.deadline,
        combined.created_at
      FROM (${baseUnionSql}) combined
      ${whereSql}
      ORDER BY combined.created_at DESC, combined.id DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;

    const rows = await this.dataSource.query(pagedSql, [
      ...params,
      limit,
      offset,
    ]);

    const data: BomListItemDto[] = rows.map((r: any) => ({
      id: r.id,
      objectType: r.object_type as 'po' | 'fit',
      objectCode: r.object_code,
      poId: r.po_id,
      colorId: r.color_id,
      colorName: r.color_name,
      styleCode: r.style_code,
      productName: r.product_name,
      poQuantity: r.po_quantity != null ? Number(r.po_quantity) : undefined,
      version: Number(r.version) || 1,
      status: r.status,
      totalCostPerUnit:
        r.object_type === 'fit'
          ? null
          : canViewCost && r.total_cost != null
            ? Math.round(Number(r.total_cost))
            : null,
      deadline: r.deadline || null,
      createdAt: r.created_at
        ? new Date(r.created_at).toISOString()
        : new Date().toISOString(),
      imageUrl: null,
    }));

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

  async findOne(id: string, user?: any): Promise<any> {
    const canViewCost = isUserAllowedToViewCost(user);

    // Check PO BOM
    const poBom = await this.bomRepo.findOne({ where: { id } });
    if (poBom) {
      const lines = await this.bomLineRepo.find({
        where: { billOfMaterialId: id },
        order: { orderIndex: 'ASC' },
      });
      const totalCost = lines.reduce(
        (acc, cur) =>
          acc +
          (Number(cur.consumptionPerUnit) || 0) * (Number(cur.unitCost) || 0),
        0,
      );
      return {
        ...poBom,
        objectType: 'po',
        objectCode: poBom.poCodeSnapshot,
        status: mapBomStatusToLabel(poBom.status),
        totalCostPerUnit: canViewCost ? Math.round(totalCost) : null,
        bomLines: canViewCost
          ? lines
          : lines.map((l) => ({ ...l, unitCost: null })),
      };
    }

    // Check Fit BOM - style itself is the Fit BOM root entity
    const style = await this.styleRepo.findOne({ where: { id } });
    if (style) {
      const lines = await this.fitBomLineRepo.find({
        where: { styleId: id },
        order: { orderIndex: 'ASC' },
      });
      return {
        id: style.id,
        styleId: style.id,
        bomCode: `FIT-${style.styleCode}`,
        objectType: 'fit',
        objectCode: `FIT-${style.styleCode}`,
        styleCode: style.styleCode,
        productName: style.styleName,
        status: style.status === StyleStatus.ACTIVE ? 'Approved' : 'Draft',
        version: 1,
        totalCostPerUnit: null,
        createdAt: style.createdAt,
        bomLines: lines,
      };
    }

    throw new NotFoundException(`BOM với ID ${id} không tồn tại.`);
  }

  /**
   * Fetch aggregate BOM stats (total, draft, pending, approved) for a given month or all time.
   */
  async getStats(period?: string): Promise<BomStatsDto> {
    const branches = [
      `SELECT
         bom.id::text as id,
         CASE bom.status::text
           WHEN 'closed' THEN 'Approved'
           WHEN 'wait_accounting' THEN 'Wait_Price'
           WHEN 'wait_rd' THEN 'Wait_RD'
           WHEN 'wait_tpkh_confirm' THEN 'Wait_TP_Approve'
           WHEN 'wait_sa_approve' THEN 'Wait_SA_Approve'
           ELSE 'Draft'
         END as status,
         bom.created_at
       FROM bills_of_materials bom`,
      `SELECT
         s.id::text as id,
         CASE s.status::text
           WHEN 'active' THEN 'Approved'
           WHEN 'approved' THEN 'Approved'
           ELSE 'Draft'
         END as status,
         s.created_at
       FROM styles s`,
    ];

    const baseUnionSql = branches.join(' UNION ALL ');
    const params: any[] = [];
    let periodWhere = '';

    if (period && period !== 'all') {
      periodWhere = `WHERE to_char(combined.created_at, 'YYYY-MM') = $1`;
      params.push(period);
    }

    const statsSql = `
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE combined.status = 'Draft')::int as draft_count,
        COUNT(*) FILTER (WHERE combined.status IN ('Wait_RD', 'Wait_Price', 'Wait_TP_Approve', 'Wait_SA_Approve'))::int as pending_count,
        COUNT(*) FILTER (WHERE combined.status IN ('Approved', 'Locked'))::int as approved_count
      FROM (${baseUnionSql}) combined
      ${periodWhere}
    `;

    const result = await this.dataSource.query(statsSql, params);
    const row = result[0] || {};

    return {
      total: Number(row.total) || 0,
      draftCount: Number(row.draft_count) || 0,
      pendingCount: Number(row.pending_count) || 0,
      approvedCount: Number(row.approved_count) || 0,
    };
  }
}
