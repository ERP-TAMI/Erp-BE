import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BillOfMaterials } from './entities/BillOfMaterials.entity';
import { BillOfMaterialLine } from './entities/BillOfMaterialLine.entity';
import { BomRevision } from './entities/BomRevision.entity';
import { FitBomLine } from '../fit-boms/entities/FitBomLine.entity';
import { FitBomRevision } from '../fit-boms/entities/FitBomRevision.entity';
import { Style } from '../styles/entities/Style.entity';
import { RevisionStatus, StyleStatus } from '../../common/enums/database.enums';
import {
  QueryBomsDto,
  QueryBomDetailDto,
  BomListItemDto,
  PaginatedBomResponseDto,
  BomStatsDto,
  CreateRevisionDto,
  UpdateRevisionLinesDto,
  ApproveRevisionDto,
  WorkflowActionDto,
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

const ALLOWED_APPROVE_ROLES = new Set([
  'sa',
  'tpkh',
  'director',
  'giam_doc',
  'admin',
  'accounting',
  'kt',
  'ke_toan',
]);

const ALLOWED_EDIT_ROLES = new Set([
  'sa',
  'tpkh',
  'nvkh',
  'rd',
  'admin',
  'director',
  'giam_doc',
  'accounting',
  'kt',
  'ke_toan',
]);

export function isUserAllowedToViewCost(user?: any): boolean {
  const roleCode = user?.roleCode || user?.role;
  if (!roleCode) return false;
  return ALLOWED_COST_ROLES.has(String(roleCode).toLowerCase().trim());
}

export function canUserEditRevision(user?: any): boolean {
  if (!user) return true;
  const roleCode = user?.roleCode || user?.role;
  if (!roleCode) return true;
  return ALLOWED_EDIT_ROLES.has(String(roleCode).toLowerCase().trim());
}

export function canUserApproveRevision(user?: any): boolean {
  if (!user) return true;
  const roleCode = user?.roleCode || user?.role;
  if (!roleCode) return true;
  return ALLOWED_APPROVE_ROLES.has(String(roleCode).toLowerCase().trim());
}

export function assertRevisionEditable(
  revision: BomRevision | FitBomRevision,
): void {
  if (revision.status !== RevisionStatus.DRAFT) {
    throw new BadRequestException(
      `Revision chỉ có thể chỉnh sửa khi ở trạng thái Draft. Trạng thái hiện tại: "${revision.status}".`,
    );
  }
}

export function normalizeBusinessDate(targetDate?: string | Date): string {
  if (!targetDate) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof targetDate === 'string') {
    const match = targetDate.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
    const parsed = new Date(targetDate);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  if (targetDate instanceof Date && !isNaN(targetDate.getTime())) {
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return new Date().toISOString().slice(0, 10);
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
    @InjectRepository(BomRevision)
    private readonly bomRevisionRepo: Repository<BomRevision>,
    @InjectRepository(FitBomLine)
    private readonly fitBomLineRepo: Repository<FitBomLine>,
    @InjectRepository(FitBomRevision)
    private readonly fitBomRevisionRepo: Repository<FitBomRevision>,
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

    const businessDate = normalizeBusinessDate(query?.targetDate);
    const params: any[] = [businessDate];
    let paramIdx = 2;
    const targetDateParamIdx = 1;
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
          COALESCE(active_rev.revision_no, (SELECT MAX(r2.revision_no) FROM bom_revisions r2 WHERE r2.bill_of_material_id = bom.id), 1) as version,
          CASE bom.status::text
            WHEN 'closed' THEN 'Approved'
            WHEN 'wait_accounting' THEN 'Wait_Price'
            WHEN 'wait_rd' THEN 'Wait_RD'
            WHEN 'wait_tpkh_confirm' THEN 'Wait_TP_Approve'
            WHEN 'wait_sa_approve' THEN 'Wait_SA_Approve'
            ELSE 'Draft'
          END as status,
          active_rev.total_cost,
          bom.deadline::text as deadline,
          bom.created_at
        FROM bills_of_materials bom
        LEFT JOIN purchase_order_product_colors popc ON popc.id = bom.product_color_id
        LEFT JOIN purchase_order_products pop ON pop.id = popc.product_id
        LEFT JOIN purchase_orders po ON po.id = pop.purchase_order_id
        LEFT JOIN LATERAL (
          SELECT 
            r.id as revision_id,
            r.revision_no,
            SUM(bml.consumption_per_unit * bml.unit_cost) as total_cost
          FROM bom_revisions r
          LEFT JOIN bill_of_material_lines bml ON bml.revision_id = r.id
          WHERE r.bill_of_material_id = bom.id
            AND r.status = 'approved'
            AND (r.effective_from IS NULL OR r.effective_from <= $${targetDateParamIdx}::date)
            AND (r.effective_to IS NULL OR $${targetDateParamIdx}::date < r.effective_to)
          GROUP BY r.id, r.revision_no
          ORDER BY r.revision_no DESC
          LIMIT 1
        ) active_rev ON true
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
          COALESCE(active_fit.revision_no, (SELECT MAX(r2.revision_no) FROM fit_bom_revisions r2 WHERE r2.style_id = s.id), 1) as version,
          CASE s.status::text
            WHEN 'active' THEN 'Approved'
            WHEN 'approved' THEN 'Approved'
            ELSE 'Draft'
          END as status,
          NULL::numeric as total_cost,
          NULL::text as deadline,
          s.created_at
        FROM styles s
        LEFT JOIN LATERAL (
          SELECT r.id, r.revision_no
          FROM fit_bom_revisions r
          WHERE r.style_id = s.id
            AND r.status = 'approved'
            AND (r.effective_from IS NULL OR r.effective_from <= $${targetDateParamIdx}::date)
            AND (r.effective_to IS NULL OR $${targetDateParamIdx}::date < r.effective_to)
          ORDER BY r.revision_no DESC
          LIMIT 1
        ) active_fit ON true
      `);
    }

    const baseUnionSql = branches.join(' UNION ALL ');
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

  /**
   * Lấy PO BOM Revision đang có hiệu lực tại ngày targetDate (CHỈ approved).
   * TUYỆT ĐỐI không fallback sang draft/in_review.
   */
  async getActivePoBomRevision(
    bomId: string,
    targetDate?: string | Date,
  ): Promise<BomRevision | null> {
    const businessDate = normalizeBusinessDate(targetDate);
    return this.bomRevisionRepo
      .createQueryBuilder('r')
      .where('r.bill_of_material_id = :bomId', { bomId })
      .andWhere('r.status = :status', { status: RevisionStatus.APPROVED })
      .andWhere(
        '(r.effective_from IS NULL OR r.effective_from <= :businessDate)',
        { businessDate },
      )
      .andWhere('(r.effective_to IS NULL OR :businessDate < r.effective_to)', {
        businessDate,
      })
      .orderBy('r.revision_no', 'DESC')
      .getOne();
  }

  /**
   * Lấy Fit BOM Revision đang có hiệu lực tại ngày targetDate (CHỈ approved).
   * TUYỆT ĐỐI không fallback sang draft/in_review.
   */
  async getActiveFitBomRevision(
    styleId: string,
    targetDate?: string | Date,
  ): Promise<FitBomRevision | null> {
    const businessDate = normalizeBusinessDate(targetDate);
    return this.fitBomRevisionRepo
      .createQueryBuilder('r')
      .where('r.style_id = :styleId', { styleId })
      .andWhere('r.status = :status', { status: RevisionStatus.APPROVED })
      .andWhere(
        '(r.effective_from IS NULL OR r.effective_from <= :businessDate)',
        { businessDate },
      )
      .andWhere('(r.effective_to IS NULL OR :businessDate < r.effective_to)', {
        businessDate,
      })
      .orderBy('r.revision_no', 'DESC')
      .getOne();
  }

  /**
   * Lấy PO BOM Revision theo ID cụ thể (cho phép draft/in_review khi UI cần xem/sửa).
   */
  async getBomRevisionById(
    bomId: string,
    revisionId: string,
  ): Promise<BomRevision | null> {
    return this.bomRevisionRepo.findOne({
      where: { id: revisionId, billOfMaterialId: bomId },
    });
  }

  /**
   * Lấy Fit BOM Revision theo ID cụ thể (cho phép draft/in_review khi UI cần xem/sửa).
   */
  async getFitBomRevisionById(
    styleId: string,
    revisionId: string,
  ): Promise<FitBomRevision | null> {
    return this.fitBomRevisionRepo.findOne({
      where: { id: revisionId, styleId },
    });
  }

  /**
   * Lấy revision draft/in_review mới nhất để phục vụ màn hình nhập liệu.
   * KHÔNG được dùng trong production/NPL.
   */
  async getLatestEditablePoBomRevision(
    bomId: string,
  ): Promise<BomRevision | null> {
    return this.bomRevisionRepo
      .createQueryBuilder('r')
      .where('r.bill_of_material_id = :bomId', { bomId })
      .andWhere('r.status IN (:...statuses)', {
        statuses: [RevisionStatus.DRAFT, RevisionStatus.IN_REVIEW],
      })
      .orderBy('r.revision_no', 'DESC')
      .getOne();
  }

  /**
   * Lấy Fit revision draft/in_review mới nhất để phục vụ màn hình nhập liệu.
   * KHÔNG được dùng trong production/NPL.
   */
  async getLatestEditableFitBomRevision(
    styleId: string,
  ): Promise<FitBomRevision | null> {
    return this.fitBomRevisionRepo
      .createQueryBuilder('r')
      .where('r.style_id = :styleId', { styleId })
      .andWhere('r.status IN (:...statuses)', {
        statuses: [RevisionStatus.DRAFT, RevisionStatus.IN_REVIEW],
      })
      .orderBy('r.revision_no', 'DESC')
      .getOne();
  }

  async findOne(
    id: string,
    user?: any,
    query?: QueryBomDetailDto,
  ): Promise<any> {
    const canViewCost = isUserAllowedToViewCost(user);

    // Check PO BOM
    const poBom = await this.bomRepo.findOne({ where: { id } });
    if (poBom) {
      let targetRevision: BomRevision | null = null;
      const isEditableRequested =
        query?.editable === true || query?.editable === 'true';

      if (query?.revisionId) {
        targetRevision = await this.getBomRevisionById(id, query.revisionId);
        if (!targetRevision) {
          throw new NotFoundException(
            `Không tìm thấy revision với ID ${query.revisionId} trên BOM này.`,
          );
        }
      } else if (query?.revisionNo) {
        targetRevision = await this.bomRevisionRepo.findOne({
          where: { billOfMaterialId: id, revisionNo: Number(query.revisionNo) },
        });
        if (!targetRevision) {
          throw new NotFoundException(
            `Không tìm thấy revision số ${query.revisionNo} trên BOM này.`,
          );
        }
      } else if (isEditableRequested) {
        // Chỉ lấy draft/in_review mới nhất khi màn hình nhập liệu yêu cầu rõ
        targetRevision = await this.getLatestEditablePoBomRevision(id);
      } else {
        // Mặc định lấy Active Approved Revision (TUYỆT ĐỐI không fallback sang draft)
        targetRevision = await this.getActivePoBomRevision(
          id,
          query?.targetDate,
        );
      }

      let lines: BillOfMaterialLine[] = [];
      if (targetRevision) {
        lines = await this.bomLineRepo.find({
          where: { revisionId: targetRevision.id },
          order: { orderIndex: 'ASC' },
        });
      }

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
        version: targetRevision?.revisionNo ?? 1,
        revision: targetRevision
          ? {
              id: targetRevision.id,
              revisionNo: targetRevision.revisionNo,
              status: targetRevision.status,
              effectiveFrom: targetRevision.effectiveFrom,
              effectiveTo: targetRevision.effectiveTo,
              changeReason: targetRevision.changeReason,
              sourceFitBomRevisionId: targetRevision.sourceFitBomRevisionId,
              approvedAt: targetRevision.approvedAt,
              approvedBy: targetRevision.approvedBy,
              isEditable: isEditableRequested,
            }
          : null,
        totalCostPerUnit:
          canViewCost && targetRevision ? Math.round(totalCost) : null,
        bomLines: canViewCost
          ? lines
          : lines.map((l) => ({ ...l, unitCost: null })),
      };
    }

    // Check Fit BOM - style itself is the Fit BOM root entity
    const style = await this.styleRepo.findOne({ where: { id } });
    if (style) {
      let targetRevision: FitBomRevision | null = null;
      const isEditableRequested =
        query?.editable === true || query?.editable === 'true';

      if (query?.revisionId) {
        targetRevision = await this.getFitBomRevisionById(id, query.revisionId);
        if (!targetRevision) {
          throw new NotFoundException(
            `Không tìm thấy revision với ID ${query.revisionId} trên Style này.`,
          );
        }
      } else if (query?.revisionNo) {
        targetRevision = await this.fitBomRevisionRepo.findOne({
          where: { styleId: id, revisionNo: Number(query.revisionNo) },
        });
        if (!targetRevision) {
          throw new NotFoundException(
            `Không tìm thấy revision số ${query.revisionNo} trên Style này.`,
          );
        }
      } else if (isEditableRequested) {
        // Chỉ lấy draft/in_review mới nhất khi màn hình nhập liệu yêu cầu rõ
        targetRevision = await this.getLatestEditableFitBomRevision(id);
      } else {
        // Mặc định lấy Active Approved Revision (TUYỆT ĐỐI không fallback sang draft)
        targetRevision = await this.getActiveFitBomRevision(
          id,
          query?.targetDate,
        );
      }

      let lines: FitBomLine[] = [];
      if (targetRevision) {
        lines = await this.fitBomLineRepo.find({
          where: { revisionId: targetRevision.id },
          order: { orderIndex: 'ASC' },
        });
      }

      return {
        id: style.id,
        styleId: style.id,
        bomCode: `FIT-${style.styleCode}`,
        objectType: 'fit',
        objectCode: `FIT-${style.styleCode}`,
        styleCode: style.styleCode,
        productName: style.styleName,
        status: style.status === StyleStatus.ACTIVE ? 'Approved' : 'Draft',
        version: targetRevision?.revisionNo ?? 1,
        revision: targetRevision
          ? {
              id: targetRevision.id,
              revisionNo: targetRevision.revisionNo,
              status: targetRevision.status,
              effectiveFrom: targetRevision.effectiveFrom,
              effectiveTo: targetRevision.effectiveTo,
              changeReason: targetRevision.changeReason,
              approvedAt: targetRevision.approvedAt,
              approvedBy: targetRevision.approvedBy,
              isEditable: isEditableRequested,
            }
          : null,
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

  /**
   * Helper xác định BOM/Style cha theo ID.
   */
  async resolveParentEntity(
    bomOrStyleId: string,
  ): Promise<
    { type: 'po'; parent: BillOfMaterials } | { type: 'fit'; parent: Style }
  > {
    const poBom = await this.bomRepo.findOne({ where: { id: bomOrStyleId } });
    if (poBom) return { type: 'po', parent: poBom };

    const style = await this.styleRepo.findOne({
      where: { id: bomOrStyleId },
    });
    if (style) return { type: 'fit', parent: style };

    throw new NotFoundException(
      `Không tìm thấy BOM hoặc Style với ID ${bomOrStyleId}`,
    );
  }

  /**
   * Lấy danh sách tất cả các Revisions của một BOM / Style.
   */
  async listRevisions(bomOrStyleId: string, user?: any): Promise<any[]> {
    const parent = await this.resolveParentEntity(bomOrStyleId);
    const canViewCost = isUserAllowedToViewCost(user);

    if (parent.type === 'po') {
      const revs = await this.bomRevisionRepo.find({
        where: { billOfMaterialId: bomOrStyleId },
        order: { revisionNo: 'DESC' },
        relations: ['lines'],
      });
      return revs.map((r) => {
        const totalCost = r.lines?.reduce(
          (acc, cur) =>
            acc +
            (Number(cur.consumptionPerUnit) || 0) * (Number(cur.unitCost) || 0),
          0,
        );
        return {
          id: r.id,
          billOfMaterialId: r.billOfMaterialId,
          revisionNo: r.revisionNo,
          status: r.status,
          effectiveFrom: r.effectiveFrom,
          effectiveTo: r.effectiveTo,
          changeReason: r.changeReason,
          sourceFitBomRevisionId: r.sourceFitBomRevisionId,
          createdBy: r.createdBy,
          createdAt: r.createdAt,
          approvedBy: r.approvedBy,
          approvedAt: r.approvedAt,
          rowVersion: Number(r.rowVersion),
          lineCount: r.lines?.length || 0,
          totalCost:
            canViewCost && totalCost != null ? Math.round(totalCost) : null,
        };
      });
    } else {
      const revs = await this.fitBomRevisionRepo.find({
        where: { styleId: bomOrStyleId },
        order: { revisionNo: 'DESC' },
        relations: ['lines'],
      });
      return revs.map((r) => ({
        id: r.id,
        styleId: r.styleId,
        revisionNo: r.revisionNo,
        status: r.status,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        changeReason: r.changeReason,
        createdBy: r.createdBy,
        createdAt: r.createdAt,
        approvedBy: r.approvedBy,
        approvedAt: r.approvedAt,
        rowVersion: Number(r.rowVersion),
        lineCount: r.lines?.length || 0,
        totalCost: null,
      }));
    }
  }

  /**
   * Tạo Revision mới (Draft) cho BOM / Style.
   * Tự động clone lines từ revision nguồn hoặc Active Approved Revision.
   */
  async createRevision(
    bomOrStyleId: string,
    dto?: CreateRevisionDto,
    user?: any,
  ): Promise<any> {
    const parent = await this.resolveParentEntity(bomOrStyleId);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (parent.type === 'po') {
        const maxResult = await queryRunner.manager.query(
          `SELECT COALESCE(MAX(revision_no), 0)::int as max_no FROM bom_revisions WHERE bill_of_material_id = $1`,
          [bomOrStyleId],
        );
        const nextRevisionNo = (maxResult[0]?.max_no || 0) + 1;

        const newRev = queryRunner.manager.create(BomRevision, {
          billOfMaterialId: bomOrStyleId,
          revisionNo: nextRevisionNo,
          status: RevisionStatus.DRAFT,
          sourceFitBomRevisionId: dto?.sourceFitBomRevisionId || null,
          effectiveFrom: null,
          effectiveTo: null,
          changeReason:
            dto?.changeReason ||
            (dto?.cloneFromRevisionId
              ? `Sao chép từ revision trước`
              : 'Tạo mới phiên bản nháp'),
          createdBy: user?.id || null,
          rowVersion: 1,
        });
        const savedRev = await queryRunner.manager.save(BomRevision, newRev);

        // Xác định revision nguồn để clone
        let sourceRevId = dto?.cloneFromRevisionId;
        if (!sourceRevId) {
          const activeRev = await this.getActivePoBomRevision(bomOrStyleId);
          sourceRevId = activeRev?.id;
        }

        let clonedLines: BillOfMaterialLine[] = [];
        if (sourceRevId) {
          const sourceLines = await queryRunner.manager.find(
            BillOfMaterialLine,
            {
              where: { revisionId: sourceRevId },
              order: { orderIndex: 'ASC' },
            },
          );
          if (sourceLines.length > 0) {
            clonedLines = sourceLines.map((line, idx) =>
              queryRunner.manager.create(BillOfMaterialLine, {
                revisionId: savedRev.id,
                materialId: line.materialId,
                materialNameSnapshot: line.materialNameSnapshot,
                materialGroupSnapshot: line.materialGroupSnapshot,
                unitSnapshot: line.unitSnapshot,
                materialGroupId: line.materialGroupId,
                unitId: line.unitId,
                consumptionPerUnit: line.consumptionPerUnit,
                unitCost: line.unitCost,
                orderIndex: line.orderIndex ?? idx + 1,
              }),
            );
            await queryRunner.manager.save(BillOfMaterialLine, clonedLines);
          }
        }

        await queryRunner.commitTransaction();
        return {
          ...savedRev,
          lines: clonedLines,
        };
      } else {
        const maxResult = await queryRunner.manager.query(
          `SELECT COALESCE(MAX(revision_no), 0)::int as max_no FROM fit_bom_revisions WHERE style_id = $1`,
          [bomOrStyleId],
        );
        const nextRevisionNo = (maxResult[0]?.max_no || 0) + 1;

        const newRev = queryRunner.manager.create(FitBomRevision, {
          styleId: bomOrStyleId,
          revisionNo: nextRevisionNo,
          status: RevisionStatus.DRAFT,
          effectiveFrom: null,
          effectiveTo: null,
          changeReason:
            dto?.changeReason ||
            (dto?.cloneFromRevisionId
              ? `Sao chép từ revision trước`
              : 'Tạo mới phiên bản nháp'),
          createdBy: user?.id || null,
          rowVersion: 1,
        });
        const savedRev = await queryRunner.manager.save(FitBomRevision, newRev);

        let sourceRevId = dto?.cloneFromRevisionId;
        if (!sourceRevId) {
          const activeRev = await this.getActiveFitBomRevision(bomOrStyleId);
          sourceRevId = activeRev?.id;
        }

        let clonedLines: FitBomLine[] = [];
        if (sourceRevId) {
          const sourceLines = await queryRunner.manager.find(FitBomLine, {
            where: { revisionId: sourceRevId },
            order: { orderIndex: 'ASC' },
          });
          if (sourceLines.length > 0) {
            clonedLines = sourceLines.map((line, idx) =>
              queryRunner.manager.create(FitBomLine, {
                revisionId: savedRev.id,
                materialId: line.materialId,
                materialNameSnapshot: line.materialNameSnapshot,
                materialGroupSnapshot: line.materialGroupSnapshot,
                unitSnapshot: line.unitSnapshot,
                materialGroupId: line.materialGroupId,
                unitId: line.unitId,
                consumption: line.consumption,
                wastePercent: line.wastePercent ?? 0,
                note: line.note,
                orderIndex: line.orderIndex ?? idx + 1,
              }),
            );
            await queryRunner.manager.save(FitBomLine, clonedLines);
          }
        }

        await queryRunner.commitTransaction();
        return {
          ...savedRev,
          lines: clonedLines,
        };
      }
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Sửa đổi nội dung Revision (Lines & Header).
   * BẮT BUỘC: status phải là DRAFT (Immutability Guard).
   */
  async updateDraftRevision(
    bomOrStyleId: string,
    revisionId: string,
    dto: UpdateRevisionLinesDto,
    user?: any,
  ): Promise<any> {
    if (!canUserEditRevision(user)) {
      throw new ForbiddenException(
        'Bạn không có quyền chỉnh sửa Revision BOM.',
      );
    }
    const parent = await this.resolveParentEntity(bomOrStyleId);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (parent.type === 'po') {
        const rev = await queryRunner.manager.findOne(BomRevision, {
          where: { id: revisionId, billOfMaterialId: bomOrStyleId },
        });
        if (!rev) {
          throw new NotFoundException(
            `Không tìm thấy revision với ID ${revisionId} trên BOM này.`,
          );
        }

        assertRevisionEditable(rev);

        if (
          dto.expectedRowVersion != null &&
          Number(rev.rowVersion) !== Number(dto.expectedRowVersion)
        ) {
          throw new ConflictException(
            'Revision đã bị thay đổi bởi người dùng khác (Row version conflict). Vui lòng tải lại trang.',
          );
        }

        if (dto.changeReason !== undefined) {
          rev.changeReason = dto.changeReason;
        }
        rev.rowVersion = Number(rev.rowVersion) + 1;
        await queryRunner.manager.save(BomRevision, rev);

        // Cập nhật Lines nếu có truyền
        let savedLines: BillOfMaterialLine[] = [];
        if (dto.lines) {
          await queryRunner.manager.delete(BillOfMaterialLine, {
            revisionId,
          });

          savedLines = dto.lines.map((l, idx) => {
            if (!l.materialNameSnapshot || !l.materialNameSnapshot.trim()) {
              throw new BadRequestException(
                `Dòng vật tư thứ ${idx + 1} phải có tên vật tư snapshot hợp lệ.`,
              );
            }
            return queryRunner.manager.create(BillOfMaterialLine, {
              revisionId,
              materialId: l.materialId || null,
              materialNameSnapshot: l.materialNameSnapshot.trim(),
              materialGroupSnapshot: l.materialGroupSnapshot?.trim() || null,
              unitSnapshot: l.unitSnapshot?.trim() || 'Cái',
              materialGroupId: l.materialGroupId || null,
              unitId: l.unitId || null,
              consumptionPerUnit: l.consumptionPerUnit ?? l.consumption ?? 0,
              unitCost: l.unitCost != null ? Number(l.unitCost) : 0,
              orderIndex: l.orderIndex ?? idx + 1,
            });
          });

          if (savedLines.length > 0) {
            await queryRunner.manager.save(BillOfMaterialLine, savedLines);
          }
        } else {
          savedLines = await queryRunner.manager.find(BillOfMaterialLine, {
            where: { revisionId },
            order: { orderIndex: 'ASC' },
          });
        }

        await queryRunner.commitTransaction();
        return {
          ...rev,
          lines: savedLines,
        };
      } else {
        const rev = await queryRunner.manager.findOne(FitBomRevision, {
          where: { id: revisionId, styleId: bomOrStyleId },
        });
        if (!rev) {
          throw new NotFoundException(
            `Không tìm thấy revision với ID ${revisionId} trên Style này.`,
          );
        }

        assertRevisionEditable(rev);

        if (
          dto.expectedRowVersion != null &&
          Number(rev.rowVersion) !== Number(dto.expectedRowVersion)
        ) {
          throw new ConflictException(
            'Revision đã bị thay đổi bởi người dùng khác (Row version conflict). Vui lòng tải lại trang.',
          );
        }

        if (dto.changeReason !== undefined) {
          rev.changeReason = dto.changeReason;
        }
        rev.rowVersion = Number(rev.rowVersion) + 1;
        await queryRunner.manager.save(FitBomRevision, rev);

        let savedLines: FitBomLine[] = [];
        if (dto.lines) {
          await queryRunner.manager.delete(FitBomLine, { revisionId });

          savedLines = dto.lines.map((l, idx) => {
            if (!l.materialNameSnapshot || !l.materialNameSnapshot.trim()) {
              throw new BadRequestException(
                `Dòng vật tư thứ ${idx + 1} phải có tên vật tư snapshot hợp lệ.`,
              );
            }
            return queryRunner.manager.create(FitBomLine, {
              revisionId,
              materialId: l.materialId || null,
              materialNameSnapshot: l.materialNameSnapshot.trim(),
              materialGroupSnapshot: l.materialGroupSnapshot?.trim() || null,
              unitSnapshot: l.unitSnapshot?.trim() || 'Cái',
              materialGroupId: l.materialGroupId || null,
              unitId: l.unitId || null,
              consumption: l.consumption ?? l.consumptionPerUnit ?? 0,
              wastePercent: l.wastePercent ?? 0,
              note: l.note || null,
              orderIndex: l.orderIndex ?? idx + 1,
            });
          });

          if (savedLines.length > 0) {
            await queryRunner.manager.save(FitBomLine, savedLines);
          }
        } else {
          savedLines = await queryRunner.manager.find(FitBomLine, {
            where: { revisionId },
            order: { orderIndex: 'ASC' },
          });
        }

        await queryRunner.commitTransaction();
        return {
          ...rev,
          lines: savedLines,
        };
      }
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Gửi duyệt revision: draft -> in_review.
   */
  async submitRevisionForReview(
    bomOrStyleId: string,
    revisionId: string,
    dto?: WorkflowActionDto,
    user?: any,
  ): Promise<any> {
    if (!canUserEditRevision(user)) {
      throw new ForbiddenException(
        'Bạn không có quyền gửi duyệt Revision BOM.',
      );
    }
    const parent = await this.resolveParentEntity(bomOrStyleId);

    if (parent.type === 'po') {
      const rev = await this.bomRevisionRepo.findOne({
        where: { id: revisionId, billOfMaterialId: bomOrStyleId },
      });
      if (!rev) {
        throw new NotFoundException(
          `Không tìm thấy revision với ID ${revisionId} trên BOM này.`,
        );
      }
      if (rev.status !== RevisionStatus.DRAFT) {
        throw new BadRequestException(
          `Chỉ revision ở trạng thái Draft mới có thể gửi duyệt. Trạng thái hiện tại: "${rev.status}".`,
        );
      }
      if (
        dto?.expectedRowVersion != null &&
        Number(rev.rowVersion) !== Number(dto.expectedRowVersion)
      ) {
        throw new ConflictException(
          'Revision đã bị thay đổi bởi người khác. Vui lòng tải lại trang.',
        );
      }

      const count = await this.bomLineRepo.count({
        where: { revisionId },
      });
      if (count === 0) {
        throw new BadRequestException(
          'Revision phải có ít nhất một dòng vật tư trước khi gửi duyệt.',
        );
      }

      rev.status = RevisionStatus.IN_REVIEW;
      if (dto?.reason) rev.changeReason = dto.reason;
      rev.rowVersion = Number(rev.rowVersion) + 1;
      return this.bomRevisionRepo.save(rev);
    } else {
      const rev = await this.fitBomRevisionRepo.findOne({
        where: { id: revisionId, styleId: bomOrStyleId },
      });
      if (!rev) {
        throw new NotFoundException(
          `Không tìm thấy revision với ID ${revisionId} trên Style này.`,
        );
      }
      if (rev.status !== RevisionStatus.DRAFT) {
        throw new BadRequestException(
          `Chỉ revision ở trạng thái Draft mới có thể gửi duyệt. Trạng thái hiện tại: "${rev.status}".`,
        );
      }
      if (
        dto?.expectedRowVersion != null &&
        Number(rev.rowVersion) !== Number(dto.expectedRowVersion)
      ) {
        throw new ConflictException(
          'Revision đã bị thay đổi bởi người khác. Vui lòng tải lại trang.',
        );
      }

      const count = await this.fitBomLineRepo.count({
        where: { revisionId },
      });
      if (count === 0) {
        throw new BadRequestException(
          'Revision phải có ít nhất một dòng vật tư trước khi gửi duyệt.',
        );
      }

      rev.status = RevisionStatus.IN_REVIEW;
      if (dto?.reason) rev.changeReason = dto.reason;
      rev.rowVersion = Number(rev.rowVersion) + 1;
      return this.fitBomRevisionRepo.save(rev);
    }
  }

  /**
   * Phê duyệt Revision: in_review -> approved.
   * Atomic transaction:
   * - Khóa và kiểm tra revision
   * - Phê duyệt revision mới
   * - Tự động đóng effective_to của revision active approved trước đó
   */
  async approveRevision(
    bomOrStyleId: string,
    revisionId: string,
    dto: ApproveRevisionDto,
    user?: any,
  ): Promise<any> {
    if (!canUserApproveRevision(user)) {
      throw new ForbiddenException(
        'Bạn không có quyền phê duyệt Revision BOM.',
      );
    }

    const parent = await this.resolveParentEntity(bomOrStyleId);
    const rawEffectiveFrom = dto?.effectiveFrom
      ? String(dto.effectiveFrom).trim()
      : '';

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (parent.type === 'po') {
        const rev = await queryRunner.manager
          .createQueryBuilder(BomRevision, 'r')
          .setLock('pessimistic_write')
          .where('r.id = :revisionId AND r.bill_of_material_id = :bomId', {
            revisionId,
            bomId: bomOrStyleId,
          })
          .getOne();

        if (!rev) {
          throw new NotFoundException(
            `Không tìm thấy revision với ID ${revisionId} trên BOM này.`,
          );
        }

        if (rev.status !== RevisionStatus.IN_REVIEW) {
          throw new BadRequestException(
            `Chỉ revision ở trạng thái In Review mới có thể phê duyệt (Approve). Trạng thái hiện tại: "${rev.status}".`,
          );
        }

        if (
          dto.expectedRowVersion != null &&
          Number(rev.rowVersion) !== Number(dto.expectedRowVersion)
        ) {
          throw new ConflictException(
            'Revision đã bị thay đổi bởi giao dịch khác (Row version conflict).',
          );
        }

        if (rev.revisionNo >= 2 && !rawEffectiveFrom) {
          throw new BadRequestException(
            'Revision số 2 trở lên bắt buộc phải chỉ định ngày bắt đầu hiệu lực (effectiveFrom).',
          );
        }

        const effectiveFrom = normalizeBusinessDate(rawEffectiveFrom);

        const lineCount = await queryRunner.manager.count(BillOfMaterialLine, {
          where: { revisionId },
        });
        if (lineCount === 0) {
          throw new BadRequestException(
            'Không thể phê duyệt revision không có dòng vật tư nào.',
          );
        }

        // Tìm Revision approved trước đó đang có effective_to IS NULL để đóng cận
        const prevApprovedRev = await queryRunner.manager
          .createQueryBuilder(BomRevision, 'r')
          .setLock('pessimistic_write')
          .where('r.bill_of_material_id = :bomId', { bomId: bomOrStyleId })
          .andWhere('r.status = :status', { status: RevisionStatus.APPROVED })
          .andWhere('r.effective_to IS NULL')
          .andWhere('r.id != :currentId', { currentId: revisionId })
          .orderBy('r.revision_no', 'DESC')
          .getOne();

        if (prevApprovedRev) {
          if (
            prevApprovedRev.effectiveFrom &&
            prevApprovedRev.effectiveFrom > effectiveFrom
          ) {
            throw new BadRequestException(
              `effectiveFrom (${effectiveFrom}) của revision mới không được trước ngày hiệu lực của revision trước (${prevApprovedRev.effectiveFrom}).`,
            );
          }
          prevApprovedRev.effectiveTo = effectiveFrom;
          await queryRunner.manager.save(BomRevision, prevApprovedRev);
        }

        rev.status = RevisionStatus.APPROVED;
        rev.effectiveFrom = effectiveFrom;
        rev.effectiveTo = null;
        rev.approvedBy = user?.id || null;
        rev.approvedAt = new Date();
        rev.rowVersion = Number(rev.rowVersion) + 1;

        const saved = await queryRunner.manager.save(BomRevision, rev);
        await queryRunner.commitTransaction();
        return saved;
      } else {
        const rev = await queryRunner.manager
          .createQueryBuilder(FitBomRevision, 'r')
          .setLock('pessimistic_write')
          .where('r.id = :revisionId AND r.style_id = :styleId', {
            revisionId,
            styleId: bomOrStyleId,
          })
          .getOne();

        if (!rev) {
          throw new NotFoundException(
            `Không tìm thấy revision với ID ${revisionId} trên Style này.`,
          );
        }

        if (rev.status !== RevisionStatus.IN_REVIEW) {
          throw new BadRequestException(
            `Chỉ revision ở trạng thái In Review mới có thể phê duyệt (Approve). Trạng thái hiện tại: "${rev.status}".`,
          );
        }

        if (
          dto.expectedRowVersion != null &&
          Number(rev.rowVersion) !== Number(dto.expectedRowVersion)
        ) {
          throw new ConflictException(
            'Revision đã bị thay đổi bởi giao dịch khác (Row version conflict).',
          );
        }

        if (rev.revisionNo >= 2 && !rawEffectiveFrom) {
          throw new BadRequestException(
            'Revision số 2 trở lên bắt buộc phải chỉ định ngày bắt đầu hiệu lực (effectiveFrom).',
          );
        }

        const effectiveFrom = normalizeBusinessDate(rawEffectiveFrom);

        const lineCount = await queryRunner.manager.count(FitBomLine, {
          where: { revisionId },
        });
        if (lineCount === 0) {
          throw new BadRequestException(
            'Không thể phê duyệt revision không có dòng vật tư nào.',
          );
        }

        const prevApprovedRev = await queryRunner.manager
          .createQueryBuilder(FitBomRevision, 'r')
          .setLock('pessimistic_write')
          .where('r.style_id = :styleId', { styleId: bomOrStyleId })
          .andWhere('r.status = :status', { status: RevisionStatus.APPROVED })
          .andWhere('r.effective_to IS NULL')
          .andWhere('r.id != :currentId', { currentId: revisionId })
          .orderBy('r.revision_no', 'DESC')
          .getOne();

        if (prevApprovedRev) {
          if (
            prevApprovedRev.effectiveFrom &&
            prevApprovedRev.effectiveFrom > effectiveFrom
          ) {
            throw new BadRequestException(
              `effectiveFrom (${effectiveFrom}) của revision mới không được trước ngày hiệu lực của revision trước (${prevApprovedRev.effectiveFrom}).`,
            );
          }
          prevApprovedRev.effectiveTo = effectiveFrom;
          await queryRunner.manager.save(FitBomRevision, prevApprovedRev);
        }

        rev.status = RevisionStatus.APPROVED;
        rev.effectiveFrom = effectiveFrom;
        rev.effectiveTo = null;
        rev.approvedBy = user?.id || null;
        rev.approvedAt = new Date();
        rev.rowVersion = Number(rev.rowVersion) + 1;

        const saved = await queryRunner.manager.save(FitBomRevision, rev);
        await queryRunner.commitTransaction();
        return saved;
      }
    } catch (err: any) {
      await queryRunner.rollbackTransaction();
      if (err?.code === '23P01') {
        throw new ConflictException(
          'Khoảng thời gian hiệu lực bị trùng lấn (overlap) với một Revision đã được duyệt khác.',
        );
      }
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Từ chối duyệt revision: in_review -> draft (trả lại kèm lý do).
   */
  async rejectRevision(
    bomOrStyleId: string,
    revisionId: string,
    dto: WorkflowActionDto,
    user?: any,
  ): Promise<any> {
    if (!canUserApproveRevision(user)) {
      throw new ForbiddenException(
        'Bạn không có quyền từ chối duyệt Revision.',
      );
    }
    if (!dto?.reason || !dto.reason.trim()) {
      throw new BadRequestException(
        'Vui lòng cung cấp lý do từ chối (reason).',
      );
    }

    const parent = await this.resolveParentEntity(bomOrStyleId);

    if (parent.type === 'po') {
      const rev = await this.bomRevisionRepo.findOne({
        where: { id: revisionId, billOfMaterialId: bomOrStyleId },
      });
      if (!rev) {
        throw new NotFoundException(
          `Không tìm thấy revision với ID ${revisionId} trên BOM này.`,
        );
      }
      if (rev.status !== RevisionStatus.IN_REVIEW) {
        throw new BadRequestException(
          `Chỉ revision ở trạng thái In Review mới có thể từ chối duyệt (Reject). Trạng thái hiện tại: "${rev.status}".`,
        );
      }
      if (
        dto.expectedRowVersion != null &&
        Number(rev.rowVersion) !== Number(dto.expectedRowVersion)
      ) {
        throw new ConflictException(
          'Revision đã bị thay đổi bởi người khác. Vui lòng tải lại trang.',
        );
      }

      rev.status = RevisionStatus.DRAFT;
      rev.changeReason = dto.reason.trim();
      rev.rowVersion = Number(rev.rowVersion) + 1;
      return this.bomRevisionRepo.save(rev);
    } else {
      const rev = await this.fitBomRevisionRepo.findOne({
        where: { id: revisionId, styleId: bomOrStyleId },
      });
      if (!rev) {
        throw new NotFoundException(
          `Không tìm thấy revision với ID ${revisionId} trên Style này.`,
        );
      }
      if (rev.status !== RevisionStatus.IN_REVIEW) {
        throw new BadRequestException(
          `Chỉ revision ở trạng thái In Review mới có thể từ chối duyệt (Reject). Trạng thái hiện tại: "${rev.status}".`,
        );
      }
      if (
        dto.expectedRowVersion != null &&
        Number(rev.rowVersion) !== Number(dto.expectedRowVersion)
      ) {
        throw new ConflictException(
          'Revision đã bị thay đổi bởi người khác. Vui lòng tải lại trang.',
        );
      }

      rev.status = RevisionStatus.DRAFT;
      rev.changeReason = dto.reason.trim();
      rev.rowVersion = Number(rev.rowVersion) + 1;
      return this.fitBomRevisionRepo.save(rev);
    }
  }

  /**
   * Hủy Revision: draft / in_review -> cancelled.
   * Approved revision tuyệt đối không thể hủy (Bất biến).
   */
  async cancelRevision(
    bomOrStyleId: string,
    revisionId: string,
    dto?: WorkflowActionDto,
    user?: any,
  ): Promise<any> {
    if (!canUserEditRevision(user)) {
      throw new ForbiddenException('Bạn không có quyền hủy Revision BOM.');
    }

    const parent = await this.resolveParentEntity(bomOrStyleId);

    if (parent.type === 'po') {
      const rev = await this.bomRevisionRepo.findOne({
        where: { id: revisionId, billOfMaterialId: bomOrStyleId },
      });
      if (!rev) {
        throw new NotFoundException(
          `Không tìm thấy revision với ID ${revisionId} trên BOM này.`,
        );
      }
      if (rev.status === RevisionStatus.APPROVED) {
        throw new BadRequestException(
          'Không thể hủy một Revision đã được phê duyệt (Approved). Revision đã duyệt là bất biến.',
        );
      }
      if (rev.status === RevisionStatus.CANCELLED) {
        throw new BadRequestException('Revision này đã bị hủy trước đó.');
      }
      if (
        rev.status !== RevisionStatus.DRAFT &&
        rev.status !== RevisionStatus.IN_REVIEW
      ) {
        throw new BadRequestException(
          `Chỉ có thể hủy Revision ở trạng thái Draft hoặc In Review. Trạng thái hiện tại: "${rev.status}".`,
        );
      }

      rev.status = RevisionStatus.CANCELLED;
      if (dto?.reason) rev.changeReason = dto.reason.trim();
      rev.rowVersion = Number(rev.rowVersion) + 1;
      return this.bomRevisionRepo.save(rev);
    } else {
      const rev = await this.fitBomRevisionRepo.findOne({
        where: { id: revisionId, styleId: bomOrStyleId },
      });
      if (!rev) {
        throw new NotFoundException(
          `Không tìm thấy revision với ID ${revisionId} trên Style này.`,
        );
      }
      if (rev.status === RevisionStatus.APPROVED) {
        throw new BadRequestException(
          'Không thể hủy một Revision đã được phê duyệt (Approved). Revision đã duyệt là bất biến.',
        );
      }
      if (rev.status === RevisionStatus.CANCELLED) {
        throw new BadRequestException('Revision này đã bị hủy trước đó.');
      }
      if (
        rev.status !== RevisionStatus.DRAFT &&
        rev.status !== RevisionStatus.IN_REVIEW
      ) {
        throw new BadRequestException(
          `Chỉ có thể hủy Revision ở trạng thái Draft hoặc In Review. Trạng thái hiện tại: "${rev.status}".`,
        );
      }

      rev.status = RevisionStatus.CANCELLED;
      if (dto?.reason) rev.changeReason = dto.reason.trim();
      rev.rowVersion = Number(rev.rowVersion) + 1;
      return this.fitBomRevisionRepo.save(rev);
    }
  }
}
