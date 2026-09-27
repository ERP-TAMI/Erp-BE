import 'dotenv/config';
import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';

/**
 * Two Fit BOMs (bom_type = 'fit') covering the two demo styles that match
 * seed-po-demo's products, so teammates building the Fit BOM screens have
 * one in-progress revision (wait_rd) and one fully approved revision
 * (closed) to look at without clicking through the whole workflow by hand.
 */

export type FitBomLineSeed = {
  materialCode: string;
  consumption: number;
  unitCost: number;
  note: string;
};
export type FitBomSeed = {
  styleCode: string;
  styleName: string;
  category: string;
  bomCode: string;
  revisionStatus: 'wait_rd' | 'closed';
  createdByEmail: string;
  approvedByEmail: string | null;
  lines: FitBomLineSeed[];
};

export const FIT_BOM_DEMO_SEED: FitBomSeed[] = [
  {
    styleCode: 'STY-7918B293MB',
    styleName: 'Pull On Flare Pants',
    category: 'Quần',
    bomCode: 'FIT-7918B293MB',
    revisionStatus: 'wait_rd',
    createdByEmail: 'nvkh@tami.test',
    approvedByEmail: null,
    lines: [
      {
        materialCode: 'BT-001',
        consumption: 1,
        unitCost: 350,
        note: 'Nút lưng quần',
      },
      {
        materialCode: 'ZP-001',
        consumption: 1,
        unitCost: 1200,
        note: 'Khoá kéo trước',
      },
      {
        materialCode: 'TAPE-001',
        consumption: 0.8,
        unitCost: 800,
        note: 'Dây thun lưng',
      },
      {
        materialCode: 'FUS-BLK',
        consumption: 0.15,
        unitCost: 15000,
        note: 'Ép cạp lưng',
      },
    ],
  },
  {
    styleCode: 'STY-7918T110MB',
    styleName: 'Ribbed Tank Top',
    category: 'Áo',
    bomCode: 'FIT-7918T110MB',
    revisionStatus: 'closed',
    createdByEmail: 'nvkh@tami.test',
    approvedByEmail: 'sa@tami.test',
    lines: [
      {
        materialCode: 'HT-001',
        consumption: 1,
        unitCost: 900,
        note: 'Hangtag chính',
      },
      {
        materialCode: 'ML-001',
        consumption: 1,
        unitCost: 300,
        note: 'Nhãn chính (main label)',
      },
      {
        materialCode: 'CL-001',
        consumption: 1,
        unitCost: 200,
        note: 'Nhãn hướng dẫn giặt',
      },
      {
        materialCode: 'SL-001',
        consumption: 1,
        unitCost: 200,
        note: 'Nhãn size',
      },
    ],
  },
];

async function getUserId(
  manager: EntityManager,
  email: string | null,
): Promise<string | null> {
  if (!email) return null;
  const rows = await manager.query(`SELECT id FROM users WHERE email = $1`, [
    email,
  ]);
  return rows[0]?.id ?? null;
}

async function upsertStyle(
  manager: EntityManager,
  seed: FitBomSeed,
  createdBy: string | null,
): Promise<string> {
  const inserted = await manager.query(
    `INSERT INTO styles (style_code, style_name, category, status, created_by)
     VALUES ($1, $2, $3, 'active'::style_status, $4)
     ON CONFLICT (style_code) DO NOTHING
     RETURNING id`,
    [seed.styleCode, seed.styleName, seed.category, createdBy],
  );
  if (inserted.length > 0) return inserted[0].id as string;

  const existing = await manager.query(
    `SELECT id FROM styles WHERE style_code = $1`,
    [seed.styleCode],
  );
  return existing[0].id as string;
}

async function upsertFitBom(
  manager: EntityManager,
  styleId: string,
  seed: FitBomSeed,
  createdBy: string | null,
): Promise<string> {
  const inserted = await manager.query(
    `INSERT INTO boms
       (bom_code, bom_type, style_id, product_code_snapshot, product_name_snapshot, created_by)
     VALUES ($1, 'fit'::bom_type, $2, $3, $4, $5)
     ON CONFLICT (bom_code) DO NOTHING
     RETURNING id`,
    [seed.bomCode, styleId, seed.styleCode, seed.styleName, createdBy],
  );
  if (inserted.length > 0) return inserted[0].id as string;

  const existing = await manager.query(
    `SELECT id FROM boms WHERE bom_code = $1`,
    [seed.bomCode],
  );
  return existing[0].id as string;
}

async function upsertRevision(
  manager: EntityManager,
  bomId: string,
  seed: FitBomSeed,
  createdBy: string | null,
  approvedBy: string | null,
): Promise<string> {
  const isClosed = seed.revisionStatus === 'closed';
  const inserted = await manager.query(
    `INSERT INTO bom_revisions
       (bom_id, revision_no, status, created_by, approved_by, approved_at)
     VALUES ($1, 1, $2::bom_revision_status, $3, $4, ${isClosed ? 'now()' : 'NULL'})
     ON CONFLICT (bom_id, revision_no) DO NOTHING
     RETURNING id`,
    [bomId, seed.revisionStatus, createdBy, isClosed ? approvedBy : null],
  );
  const revisionId =
    inserted.length > 0
      ? (inserted[0].id as string)
      : (
          await manager.query(
            `SELECT id FROM bom_revisions WHERE bom_id = $1 AND revision_no = 1`,
            [bomId],
          )
        )[0].id;

  await manager.query(
    `UPDATE boms SET current_revision_id = $1 WHERE id = $2`,
    [revisionId, bomId],
  );

  return revisionId;
}

async function upsertLine(
  manager: EntityManager,
  revisionId: string,
  line: FitBomLineSeed,
  orderIndex: number,
): Promise<void> {
  const material = (
    await manager.query(
      `SELECT m.id, m.material_name, m.default_unit_id, m.material_group_id, mg.name AS group_name, u.name AS unit_name
       FROM materials m
       LEFT JOIN material_groups mg ON mg.id = m.material_group_id
       LEFT JOIN units u ON u.id = m.default_unit_id
       WHERE m.material_code = $1`,
      [line.materialCode],
    )
  )[0];
  if (!material) {
    throw new Error(
      `seed-fit-bom-demo: material_code "${line.materialCode}" not found — run seed:master-data first.`,
    );
  }

  await manager.query(
    `INSERT INTO bom_lines
       (revision_id, material_id, material_name_snapshot, material_group_snapshot,
        unit_snapshot, material_group_id, unit_id, consumption, unit_cost, note, order_index)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (revision_id, order_index) DO UPDATE
     SET consumption = EXCLUDED.consumption, unit_cost = EXCLUDED.unit_cost, note = EXCLUDED.note,
         material_group_id = EXCLUDED.material_group_id`,
    [
      revisionId,
      material.id,
      material.material_name,
      material.group_name,
      material.unit_name,
      material.material_group_id ?? null,
      material.default_unit_id,
      line.consumption,
      line.unitCost,
      line.note,
      orderIndex,
    ],
  );
}

async function ensureRevisionHistory(
  manager: EntityManager,
  revisionId: string,
  seed: FitBomSeed,
  changedBy: string | null,
): Promise<void> {
  const existing = await manager.query(
    `SELECT id FROM bom_revision_status_history WHERE revision_id = $1 LIMIT 1`,
    [revisionId],
  );
  if (existing.length > 0) return;

  const action = seed.revisionStatus === 'closed' ? 'approve' : 'submit';
  await manager.query(
    `INSERT INTO bom_revision_status_history
       (revision_id, old_status, new_status, action, reason, changed_by)
     VALUES ($1, NULL, $2::bom_revision_status, $3, 'Seed demo data', $4)`,
    [revisionId, seed.revisionStatus, action, changedBy],
  );
}

export async function seedFitBomDemo(manager: EntityManager): Promise<void> {
  for (const seed of FIT_BOM_DEMO_SEED) {
    const createdBy = await getUserId(manager, seed.createdByEmail);
    const approvedBy = await getUserId(manager, seed.approvedByEmail);

    const styleId = await upsertStyle(manager, seed, createdBy);
    const bomId = await upsertFitBom(manager, styleId, seed, createdBy);
    const revisionId = await upsertRevision(
      manager,
      bomId,
      seed,
      createdBy,
      approvedBy,
    );

    for (let i = 0; i < seed.lines.length; i++) {
      await upsertLine(manager, revisionId, seed.lines[i], i);
    }

    await ensureRevisionHistory(
      manager,
      revisionId,
      seed,
      approvedBy ?? createdBy,
    );
  }
}

export async function seedFitBomDemoCatalog(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.transaction(seedFitBomDemo);
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await seedFitBomDemoCatalog(AppDataSource);
    console.log(`Seeded ${FIT_BOM_DEMO_SEED.length} demo Fit BOM(s).`);
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Seed Fit BOM demo failed:', error);
    process.exitCode = 1;
  });
}
