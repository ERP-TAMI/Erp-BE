import { Injectable, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BillOfMaterials } from './entities/BillOfMaterials.entity';
import { BillOfMaterialLine } from './entities/BillOfMaterialLine.entity';
import { DraftBomFamilie } from '../draft-boms/entities/DraftBomFamilie.entity';
import { DraftBomVersion } from '../draft-boms/entities/DraftBomVersion.entity';
import { DraftBomLine } from '../draft-boms/entities/DraftBomLine.entity';
import { Style } from '../styles/entities/Style.entity';
import { PurchaseOrder } from '../purchase-orders/entities/PurchaseOrder.entity';
import { PurchaseOrderProduct } from '../purchase-orders/entities/PurchaseOrderProduct.entity';
import { PurchaseOrderProductColor } from '../purchase-orders/entities/PurchaseOrderProductColor.entity';
import { Material } from '../master-data/entities/Material.entity';
import { QueryBomsDto, BomListItemDto } from './dto';
import { BomStatus } from '../../common/enums/database.enums';

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

export function isUserAllowedToViewCost(
  user?: any,
  headerRole?: string,
): boolean {
  const roleCode = user?.roleCode || user?.role || headerRole;
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
export class BomsService implements OnModuleInit {
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
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderProduct)
    private readonly poProductRepo: Repository<PurchaseOrderProduct>,
    @InjectRepository(PurchaseOrderProductColor)
    private readonly poColorRepo: Repository<PurchaseOrderProductColor>,
    @InjectRepository(Material)
    private readonly materialRepo: Repository<Material>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedDemoBomsIfEmpty();
    } catch (err) {
      console.warn('Auto-seed demo BOMs skipped:', err);
    }
  }

  /**
   * Fetch both Fit BOMs and PO BOMs, combine them, filter and apply role-based cost masking.
   */
  async findAll(
    query?: QueryBomsDto,
    user?: any,
    headerRole?: string,
  ): Promise<BomListItemDto[]> {
    const canViewCost = isUserAllowedToViewCost(user, headerRole);
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

    // 4. Role-based Cost Masking
    if (!canViewCost) {
      return filtered.map((item) => ({
        ...item,
        totalCostPerUnit: null,
      }));
    }

    return filtered;
  }

  async findOne(id: string, user?: any, headerRole?: string): Promise<any> {
    const canViewCost = isUserAllowedToViewCost(user, headerRole);

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
        totalCostPerUnit: canViewCost ? totalCost : null,
        bomLines: canViewCost
          ? lines
          : lines.map((l) => ({ ...l, unitCost: null })),
      };
    }

    // Check Fit BOM
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
        totalCostPerUnit: canViewCost ? 145000 : null,
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
        dbv.id as version_id,
        COALESCE(SUM(dbl.consumption * 50000), 0) as total_cost
      FROM draft_bom_families dbf
      JOIN styles s ON s.id = dbf.style_id
      LEFT JOIN draft_bom_versions dbv ON dbv.family_id = dbf.id AND dbv.is_current = true
      LEFT JOIN draft_bom_lines dbl ON dbl.version_id = dbv.id
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
      totalCostPerUnit: Math.round(Number(r.total_cost) || 145000),
      deadline: null,
      createdAt: r.created_at
        ? new Date(r.created_at).toISOString()
        : new Date().toISOString(),
      imageUrl: null,
    }));
  }

  /**
   * Automatically seed initial demo BOM data if both tables are empty,
   * linking them to existing PO colors and Styles in the database.
   */
  async seedDemoBomsIfEmpty(): Promise<void> {
    const bomCount = await this.bomRepo.count();
    const draftCount = await this.draftBomRepo.count();
    if (bomCount > 0 || draftCount > 0) return;

    // 1. Seed PO BOMs from existing purchase_order_product_colors
    const poColors = await this.dataSource.query(`
      SELECT
        po.id as po_id,
        po.po_code,
        pop.id as product_id,
        pop.product_code,
        pop.product_name,
        popc.id as color_id,
        popc.color_name
      FROM purchase_order_product_colors popc
      JOIN purchase_order_products pop ON pop.id = popc.product_id
      JOIN purchase_orders po ON po.id = pop.purchase_order_id
      LIMIT 5
    `);

    const materials = await this.materialRepo.find({ take: 5 });

    const statuses: BomStatus[] = [
      BomStatus.CLOSED,
      BomStatus.WAIT_ACCOUNTING,
      BomStatus.WAIT_RD,
      BomStatus.DRAFT,
      BomStatus.CLOSED,
    ];

    for (let i = 0; i < poColors.length; i++) {
      const pc = poColors[i];
      const bomCode = `BOM-${pc.po_code}-${pc.product_code}-${i + 1}`;
      const status = statuses[i % statuses.length];
      const isClosed = status === BomStatus.CLOSED;

      const insertedBom = await this.dataSource.query(
        `INSERT INTO bills_of_materials
           (bom_code, product_color_id, product_code_snapshot, product_name_snapshot,
            color_name_snapshot, po_code_snapshot, order_quantity_snapshot, status, approved_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
         ON CONFLICT (bom_code) DO NOTHING
         RETURNING id`,
        [
          bomCode,
          pc.color_id,
          pc.product_code,
          pc.product_name,
          pc.color_name,
          pc.po_code,
          500,
          status,
          isClosed ? new Date() : null,
        ],
      );

      const bomId = insertedBom[0]?.id;
      if (bomId && materials.length > 0) {
        // Add 2-3 BOM lines
        const linesToInsert = materials.slice(0, 3);
        for (let idx = 0; idx < linesToInsert.length; idx++) {
          const mat = linesToInsert[idx];
          const unitCost = 25000 + idx * 30000;
          const consumption = 1.25 + idx * 0.5;
          await this.dataSource.query(
            `INSERT INTO bill_of_material_lines
               (bill_of_material_id, material_id, material_name_snapshot, unit_snapshot, consumption_per_unit, unit_cost, order_index, created_at, updated_at)
             VALUES ($1, $2, $3, 'Mét', $4, $5, $6, now(), now())
             ON CONFLICT DO NOTHING`,
            [bomId, mat.id, mat.materialName, consumption, unitCost, idx],
          );
        }
      }
    }

    // 2. Seed Fit BOMs from existing styles
    const styles = await this.styleRepo.find({ take: 3 });
    for (let idx = 0; idx < styles.length; idx++) {
      const st = styles[idx];
      const bomCode = `FIT-${st.styleCode}`;

      const insertedDraft = await this.dataSource.query(
        `INSERT INTO draft_bom_families
           (style_id, bom_code, created_at)
         VALUES ($1, $2, now())
         ON CONFLICT (bom_code) DO NOTHING
         RETURNING id`,
        [st.id, bomCode],
      );

      const familyId = insertedDraft[0]?.id;
      if (familyId) {
        const insertedVersion = await this.dataSource.query(
          `INSERT INTO draft_bom_versions
             (family_id, version_no, is_current, change_reason, created_at)
           VALUES ($1, 1, true, 'Khởi tạo BOM mẫu Fit', now())
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [familyId],
        );

        const versionId = insertedVersion[0]?.id;
        if (versionId && materials.length > 0) {
          for (let mIdx = 0; mIdx < Math.min(materials.length, 2); mIdx++) {
            const mat = materials[mIdx];
            await this.dataSource.query(
              `INSERT INTO draft_bom_lines
                 (version_id, material_id, material_name_snapshot, consumption, order_index)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT DO NOTHING`,
              [versionId, mat.id, mat.materialName, 1.5, mIdx],
            );
          }
        }
      }
    }
  }
}
