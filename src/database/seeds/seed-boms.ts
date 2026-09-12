import 'dotenv/config';
import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';

export async function seedDemoBoms(manager: EntityManager): Promise<void> {
  // Check if BOMs already exist
  const existingBoms = await manager.query(
    'SELECT count(*) FROM bills_of_materials',
  );
  const existingFitBoms = await manager.query(
    'SELECT count(*) FROM fit_bom_lines',
  );
  if (
    parseInt(existingBoms[0]?.count || '0', 10) > 0 &&
    parseInt(existingFitBoms[0]?.count || '0', 10) > 0
  ) {
    console.log('BOMs and Fit BOM lines already seeded, skipping.');
    return;
  }

  // 1. PO BOMs
  const poColors = await manager.query(`
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
    LIMIT 10
  `);

  const materials = await manager.query(`
    SELECT
      m.id,
      m.material_name,
      mg.id as material_group_id,
      mg.name as material_group_name,
      u.id as unit_id,
      u.name as unit_name
    FROM materials m
    LEFT JOIN material_groups mg ON mg.id = m.material_group_id
    LEFT JOIN units u ON u.id = m.default_unit_id
    LIMIT 5
  `);

  const statuses = [
    'closed',
    'wait_accounting',
    'wait_rd',
    'draft',
    'closed',
    'wait_tpkh_confirm',
  ];

  for (let i = 0; i < poColors.length; i++) {
    const pc = poColors[i];
    const bomCode = `BOM-${pc.po_code}-${pc.product_code}-${i + 1}`;
    const status = statuses[i % statuses.length];

    const isClosed = status === 'closed';
    const insertedBom = await manager.query(
      `INSERT INTO bills_of_materials
         (bom_code, product_color_id, product_code_snapshot, product_name_snapshot,
          color_name_snapshot, po_code_snapshot, order_quantity_snapshot, status, approved_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::bom_status, $9, now(), now())
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
      for (let idx = 0; idx < Math.min(materials.length, 3); idx++) {
        const mat = materials[idx];
        const unitCost = 28000 + idx * 25000;
        const consumption = 1.25 + idx * 0.4;
        await manager.query(
          `INSERT INTO bill_of_material_lines
             (bill_of_material_id, material_id, material_name_snapshot, material_group_snapshot, unit_snapshot, consumption_per_unit, unit_cost, order_index, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
           ON CONFLICT DO NOTHING`,
          [
            bomId,
            mat.id,
            mat.material_name,
            mat.material_group_name || null,
            mat.unit_name || 'Mét',
            consumption,
            unitCost,
            idx,
          ],
        );
      }
    }
  }

  // 2. Fit BOMs
  const styles = await manager.query(
    `SELECT id, style_code, style_name, status FROM styles LIMIT 5`,
  );
  for (let idx = 0; idx < styles.length; idx++) {
    const st = styles[idx];
    if (materials.length > 0) {
      for (let mIdx = 0; mIdx < Math.min(materials.length, 2); mIdx++) {
        const mat = materials[mIdx];
        await manager.query(
          `INSERT INTO fit_bom_lines
             (style_id, material_id, material_name_snapshot, material_group_snapshot, unit_snapshot, material_group_id, unit_id, consumption, order_index, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
           ON CONFLICT DO NOTHING`,
          [
            st.id,
            mat.id,
            mat.material_name,
            mat.material_group_name || null,
            mat.unit_name || 'Mét',
            mat.material_group_id || null,
            mat.unit_id || null,
            1.2,
            mIdx,
          ],
        );
      }
    }
  }
}

export async function seedDemoBomsCatalog(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.transaction(seedDemoBoms);
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await seedDemoBomsCatalog(AppDataSource);
    console.log('Seeded demo BOMs successfully.');
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Seed demo BOMs failed:', error);
    process.exitCode = 1;
  });
}
