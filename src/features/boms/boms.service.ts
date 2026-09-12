import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BillOfMaterials } from './entities/BillOfMaterials.entity';
import { BillOfMaterialLine } from './entities/BillOfMaterialLine.entity';
import { DraftBomFamilie } from '../draft-boms/entities/DraftBomFamilie.entity';
import { DraftBomVersion } from '../draft-boms/entities/DraftBomVersion.entity';
import { DraftBomLine } from '../draft-boms/entities/DraftBomLine.entity';
import { Style } from '../styles/entities/Style.entity';
import { QueryBomsDto, BomListItemDto, PaginatedBomResponseDto } from './dto';

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
    @InjectRepository(DraftBomFamilie)
    private readonly draftBomRepo: Repository<DraftBomFamilie>,
    @InjectRepository(DraftBomVersion)
    private readonly draftVersionRepo: Repository<DraftBomVersion>,
    @InjectRepository(DraftBomLine)
    private readonly draftLineRepo: Repository<DraftBomLine>,
    @InjectRepository(Style)
    private readonly styleRepo: Repository<Style>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Fetch both Fit BOMs and PO BOMs, combine them, filter, paginate, and apply role-based cost masking.
   */
  async findAll(
    query?: QueryBomsDto,
    user?: any,
  ): Promise<PaginatedBomResponseDto> {
    const canViewCost = isUserAllowedToViewCost(user);
    const items: BomListItemDto[] = [];

    const shouldIncludePo =
      !query?.objectType ||
      query.objectType === 'all' ||
      query.objectType === 'po';
    const shouldIncludeFit =
      !query?.objectType ||
      query.objectType === 'all' ||
      query.objectType === 'fit';

    // 1. Fetch PO BOMs
    if (shouldIncludePo) {
      const poBoms = await this.fetchPoBoms();
      items.push(...poBoms);
    }

    // 2. Fetch Fit BOMs
    if (shouldIncludeFit) {
      const fitBoms = await this.fetchFitBoms();
      items.push(...fitBoms);
    }

    // 3. Apply Filters
    let filtered = items;

    if (query?.status) {
      const s = query.status.toLowerCase();
      filtered = filtered.filter((i) => i.status.toLowerCase() === s);
    }

    if (query?.poCode) {
      const po = query.poCode.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.objectCode.toLowerCase().includes(po) ||
          i.poId.toLowerCase().includes(po),
      );
    }

    if (query?.search) {
      const q = query.search.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.objectCode.toLowerCase().includes(q) ||
          i.styleCode.toLowerCase().includes(q) ||
          i.productName.toLowerCase().includes(q),
      );
    }

    if (query?.colorName) {
      const c = query.colorName.toLowerCase();
      filtered = filtered.filter(
        (i) => i.colorName && i.colorName.toLowerCase().includes(c),
      );
    }

    // Sort by createdAt DESC
    filtered.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    // 4. Role-based Cost Masking (Fit BOM is always null; PO BOM masked if !canViewCost)
    const costProcessed = filtered.map((item) => ({
      ...item,
      totalCostPerUnit:
        item.objectType === 'fit'
          ? null
          : canViewCost
            ? item.totalCostPerUnit
            : null,
    }));

    // 5. Pagination
    const page = query?.page && query.page > 0 ? Number(query.page) : 1;
    const limit = query?.limit && query.limit > 0 ? Number(query.limit) : 10;
    const total = costProcessed.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const paginated = costProcessed.slice((page - 1) * limit, page * limit);

    return {
      data: paginated,
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

    // Check Fit BOM - Fit BOM has NO production cost according to business logic (always null)
    const fitBom = await this.draftBomRepo.findOne({ where: { id } });
    if (fitBom) {
      const style = await this.styleRepo.findOne({
        where: { id: fitBom.styleId },
      });
      const version = await this.draftVersionRepo.findOne({
        where: { familyId: fitBom.id, isCurrent: true },
      });
      const lines = version
        ? await this.draftLineRepo.find({
            where: { versionId: version.id },
            order: { orderIndex: 'ASC' },
          })
        : [];
      return {
        ...fitBom,
        objectType: 'fit',
        objectCode: fitBom.bomCode,
        styleCode: style?.styleCode || '—',
        productName: style?.styleName || '—',
        status: style?.status === 'active' ? 'Approved' : 'Draft',
        version: version?.versionNo || 1,
        totalCostPerUnit: null,
        bomLines: lines,
      };
    }

    throw new NotFoundException(`BOM với ID ${id} không tồn tại.`);
  }

  private async fetchPoBoms(): Promise<BomListItemDto[]> {
    const rows = await this.dataSource.query(`
      SELECT
        bom.id,
        bom.bom_code,
        bom.po_code_snapshot,
        bom.product_code_snapshot,
        bom.product_name_snapshot,
        bom.color_name_snapshot,
        bom.order_quantity_snapshot,
        bom.deadline,
        bom.status,
        bom.row_version,
        bom.created_at,
        popc.id as color_id,
        po.id as po_id,
        COALESCE(SUM(boml.consumption_per_unit * boml.unit_cost), 0) as total_cost
      FROM bills_of_materials bom
      LEFT JOIN purchase_order_product_colors popc ON popc.id = bom.product_color_id
      LEFT JOIN purchase_order_products pop ON pop.id = popc.product_id
      LEFT JOIN purchase_orders po ON po.id = pop.purchase_order_id
      LEFT JOIN bill_of_material_lines boml ON boml.bill_of_material_id = bom.id
      GROUP BY
        bom.id,
        bom.bom_code,
        bom.po_code_snapshot,
        bom.product_code_snapshot,
        bom.product_name_snapshot,
        bom.color_name_snapshot,
        bom.order_quantity_snapshot,
        bom.deadline,
        bom.status,
        bom.row_version,
        bom.created_at,
        popc.id,
        po.id
    `);

    return rows.map((r: any) => ({
      id: r.id,
      objectType: 'po',
      objectCode: r.po_code_snapshot || r.bom_code,
      poId: r.po_id || '',
      colorId: r.color_id || null,
      colorName: r.color_name_snapshot || null,
      styleCode: r.product_code_snapshot || '—',
      productName: r.product_name_snapshot || '—',
      poQuantity: Number(r.order_quantity_snapshot) || 0,
      version: Number(r.row_version) || 1,
      status: mapBomStatusToLabel(r.status),
      totalCostPerUnit: Math.round(Number(r.total_cost) || 0),
      deadline: r.deadline ? new Date(r.deadline).toISOString() : null,
      createdAt: r.created_at
        ? new Date(r.created_at).toISOString()
        : new Date().toISOString(),
      imageUrl: null,
    }));
  }

  private async fetchFitBoms(): Promise<BomListItemDto[]> {
    const rows = await this.dataSource.query(`
      SELECT
        dbf.id,
        dbf.bom_code,
        dbf.created_at,
        s.id as style_id,
        s.style_code,
        s.style_name,
        s.status as style_status,
        dbv.version_no,
        dbv.id as version_id
      FROM draft_bom_families dbf
      JOIN styles s ON s.id = dbf.style_id
      LEFT JOIN draft_bom_versions dbv ON dbv.family_id = dbf.id AND dbv.is_current = true
      GROUP BY
        dbf.id,
        dbf.bom_code,
        dbf.created_at,
        s.id,
        s.style_code,
        s.style_name,
        s.status,
        dbv.version_no,
        dbv.id
    `);

    return rows.map((r: any) => ({
      id: r.id,
      objectType: 'fit',
      objectCode: r.bom_code,
      poId: '',
      colorId: null,
      colorName: 'Tiêu chuẩn',
      styleCode: r.style_code || '—',
      productName: r.style_name || '—',
      poQuantity: undefined,
      version: Number(r.version_no) || 1,
      status: r.style_status === 'active' ? 'Approved' : 'Draft',
      totalCostPerUnit: null, // Fit BOM has no cost according to business logic
      deadline: null,
      createdAt: r.created_at
        ? new Date(r.created_at).toISOString()
        : new Date().toISOString(),
      imageUrl: null,
    }));
  }
}
