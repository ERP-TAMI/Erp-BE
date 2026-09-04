import 'dotenv/config';
import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';
import { STAGE_GROUP_SEEDS } from './seed-stage-groups';
import { STAGE_SEEDS } from './seed-stages';
import {
  MATERIAL_GROUP_SEEDS,
  MATERIAL_SEEDS,
  SIZE_CHART_SEEDS,
  STABLE_SAMPLE_IDS,
  WORKSHOP_SEEDS,
  stableSampleId,
} from './sample-master-data';

const RESET_ENVIRONMENTS = new Set(['local', 'development', 'test', 'staging']);

export type SeedSampleMasterDataOptions = {
  reset?: boolean;
  nodeEnv?: string;
};

export function assertResetEnvironment(nodeEnv: string | undefined): void {
  if (!nodeEnv || !RESET_ENVIRONMENTS.has(nodeEnv)) {
    throw new Error(
      `Reset dữ liệu mẫu chỉ được chạy ở local, development, test hoặc staging; NODE_ENV hiện tại là "${nodeEnv}".`,
    );
  }
}

function placeholders(
  rowCount: number,
  columnCount: number,
  parameterOffset = 0,
): string {
  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const columns = Array.from(
      { length: columnCount },
      (__, columnIndex) =>
        `$${parameterOffset + rowIndex * columnCount + columnIndex + 1}`,
    );
    return `(${columns.join(', ')})`;
  }).join(',\n');
}

async function resetCatalog(manager: EntityManager): Promise<void> {
  await manager.query(
    `DELETE FROM materials
     WHERE material_code = ANY($1::text[])`,
    [MATERIAL_SEEDS.map((seed) => seed.materialCode)],
  );
  await manager.query(
    `DELETE FROM material_groups
     WHERE LOWER(BTRIM(name)) = ANY($1::text[])`,
    [MATERIAL_GROUP_SEEDS.map((seed) => seed.name.toLocaleLowerCase('vi'))],
  );
  await manager.query(
    `DELETE FROM stage_groups
     WHERE group_code = ANY($1::text[])`,
    [STAGE_GROUP_SEEDS.map((seed) => seed.groupCode)],
  );
  await manager.query(
    `DELETE FROM stages
     WHERE stage_code = ANY($1::text[])`,
    [STAGE_SEEDS.map((seed) => seed.stageCode)],
  );
  await manager.query(
    `DELETE FROM workshops
     WHERE workshop_code = ANY($1::text[])`,
    [WORKSHOP_SEEDS.map((seed) => seed.workshopCode)],
  );
  await manager.query(
    `DELETE FROM size_charts
     WHERE LOWER(BTRIM(name)) = ANY($1::text[])`,
    [SIZE_CHART_SEEDS.map((seed) => seed.name.toLocaleLowerCase('vi'))],
  );
}

async function ensureUnits(manager: EntityManager): Promise<void> {
  const unitNames = ['Cái', 'Mét'] as const;
  await manager.query(
    `INSERT INTO units (id, name, status)
     SELECT seed.id::uuid, seed.name, 'active'::record_status
     FROM (VALUES ${placeholders(unitNames.length, 2)}) AS seed(id, name)
     WHERE NOT EXISTS (
       SELECT 1 FROM units WHERE LOWER(BTRIM(units.name)) = LOWER(BTRIM(seed.name))
     )
     ON CONFLICT DO NOTHING`,
    unitNames.flatMap((name) => [stableSampleId('unit', name), name]),
  );
}

async function ensureMaterialGroups(manager: EntityManager): Promise<void> {
  await manager.query(
    `INSERT INTO material_groups (id, name, status)
     VALUES ${placeholders(MATERIAL_GROUP_SEEDS.length, 3)}
     ON CONFLICT DO NOTHING`,
    MATERIAL_GROUP_SEEDS.flatMap((seed) => [seed.id, seed.name, 'active']),
  );
}

async function ensureMaterials(manager: EntityManager): Promise<void> {
  const rows = MATERIAL_SEEDS.map((seed) => [
    seed.id,
    seed.materialCode,
    seed.materialName,
    seed.groupName,
    seed.unitName,
    seed.defaultYieldPct,
  ]).flat();
  await manager.query(
    `INSERT INTO materials (
       id, material_code, material_name, material_group_id,
       default_unit_id, default_yield_pct, status
     )
     SELECT seed.id::uuid, seed.material_code, seed.material_name,
            material_groups.id, units.id, seed.default_yield_pct::numeric,
            'active'::record_status
     FROM (VALUES ${placeholders(MATERIAL_SEEDS.length, 6)}) AS seed(
       id, material_code, material_name, material_group_name,
       unit_name, default_yield_pct
     )
     JOIN material_groups
       ON LOWER(BTRIM(material_groups.name)) = LOWER(BTRIM(seed.material_group_name))
     JOIN units ON LOWER(BTRIM(units.name)) = LOWER(BTRIM(seed.unit_name))
     ON CONFLICT (UPPER(BTRIM(material_code))) DO NOTHING`,
    rows,
  );
}

async function ensureStages(manager: EntityManager): Promise<void> {
  await manager.query(
    `INSERT INTO stages (
       id, stage_code, stage_name, description, default_ssv, status
     )
     VALUES ${placeholders(STAGE_SEEDS.length, 6)}
     ON CONFLICT (stage_code) DO NOTHING`,
    STAGE_SEEDS.flatMap((seed) => [
      STABLE_SAMPLE_IDS.stages[seed.stageCode],
      seed.stageCode,
      seed.stageName,
      seed.description,
      seed.ssv,
      'active',
    ]),
  );
}

async function ensureStageGroups(manager: EntityManager): Promise<void> {
  const groupParameters = STAGE_GROUP_SEEDS.flatMap((seed) => [
    STABLE_SAMPLE_IDS.stageGroups[seed.groupCode],
    seed.groupCode,
    seed.groupName,
    seed.description,
    'active',
  ]);
  const items = STAGE_GROUP_SEEDS.flatMap((group) =>
    group.items.map((item) => ({ group, item })),
  );
  const itemParameters = items.flatMap(({ group, item }) => [
    stableSampleId('stage-group-item', `${group.groupCode}:${item.orderIndex}`),
    group.groupCode,
    item.itemName,
    item.description,
    item.ssv,
    item.orderIndex,
  ]);

  await manager.query(
    `WITH inserted_stage_groups AS (
       INSERT INTO stage_groups (
         id, group_code, group_name, description, status
       )
       VALUES ${placeholders(STAGE_GROUP_SEEDS.length, 5)}
       ON CONFLICT (group_code) DO NOTHING
       RETURNING id, group_code
     )
     INSERT INTO stage_group_items (
       id, stage_group_id, item_name, description, ssv, status, order_index
     )
     SELECT seed.id::uuid, inserted_stage_groups.id, seed.item_name,
            seed.description, seed.ssv::numeric, 'active'::record_status,
            seed.order_index::integer
     FROM (VALUES ${placeholders(items.length, 6, groupParameters.length)}) AS seed(
       id, group_code, item_name, description, ssv, order_index
     )
     JOIN inserted_stage_groups
       ON inserted_stage_groups.group_code = seed.group_code
     ON CONFLICT (stage_group_id, order_index) DO NOTHING`,
    [...groupParameters, ...itemParameters],
  );
}

async function ensureWorkshops(manager: EntityManager): Promise<void> {
  await manager.query(
    `INSERT INTO workshops (
       id, workshop_code, name, manager, location, daily_capacity, status
     )
     VALUES ${placeholders(WORKSHOP_SEEDS.length, 7)}
     ON CONFLICT (workshop_code) DO NOTHING`,
    WORKSHOP_SEEDS.flatMap((seed) => [
      seed.id,
      seed.workshopCode,
      seed.name,
      seed.manager,
      seed.location,
      seed.dailyCapacity,
      'active',
    ]),
  );
}

async function ensureSizeCharts(manager: EntityManager): Promise<void> {
  const chartParameters = SIZE_CHART_SEEDS.flatMap((seed) => [
    seed.id,
    seed.name,
    'active',
    1,
    null,
  ]);
  const items = SIZE_CHART_SEEDS.flatMap((chart) =>
    chart.sizes.map((sizeLabel, orderIndex) => ({
      chart,
      sizeLabel,
      orderIndex,
    })),
  );
  const itemParameters = items.flatMap(({ chart, sizeLabel, orderIndex }) => [
    stableSampleId('size-chart-item', `${chart.name}:${sizeLabel}`),
    chart.name,
    sizeLabel,
    orderIndex,
  ]);

  await manager.query(
    `WITH inserted_size_charts AS (
       INSERT INTO size_charts (
         id, name, status, revision_no, supersedes_id
       )
       VALUES ${placeholders(SIZE_CHART_SEEDS.length, 5)}
       ON CONFLICT DO NOTHING
       RETURNING id, name
     )
     INSERT INTO size_chart_items (id, size_chart_id, size_label, order_index)
     SELECT seed.id::uuid, inserted_size_charts.id, seed.size_label,
            seed.order_index::integer
     FROM (VALUES ${placeholders(items.length, 4, chartParameters.length)}) AS seed(
       id, chart_name, size_label, order_index
     )
     JOIN inserted_size_charts
       ON LOWER(BTRIM(inserted_size_charts.name)) = LOWER(BTRIM(seed.chart_name))
     ON CONFLICT DO NOTHING`,
    [...chartParameters, ...itemParameters],
  );
}

export async function ensureSampleMasterData(
  manager: EntityManager,
): Promise<void> {
  await ensureUnits(manager);
  await ensureMaterialGroups(manager);
  await ensureMaterials(manager);
  await ensureStages(manager);
  await ensureStageGroups(manager);
  await ensureWorkshops(manager);
  await ensureSizeCharts(manager);
}

function databaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as {
    code?: string;
    driverError?: { code?: string };
  };
  return candidate.driverError?.code ?? candidate.code;
}

export async function seedSampleMasterData(
  dataSource: DataSource,
  options: SeedSampleMasterDataOptions = {},
): Promise<void> {
  if (options.reset) {
    assertResetEnvironment(options.nodeEnv ?? process.env.NODE_ENV);
  }

  try {
    await dataSource.transaction(async (manager) => {
      if (options.reset) await resetCatalog(manager);
      await ensureSampleMasterData(manager);
    });
  } catch (error: unknown) {
    if (options.reset && databaseErrorCode(error) === '23503') {
      throw new Error(
        'Không thể reset catalog mẫu vì đang có dữ liệu nghiệp vụ tham chiếu. Transaction đã rollback; hãy xóa fixture phụ thuộc rồi chạy lại.',
      );
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const reset = process.argv.includes('--reset');
  if (reset) assertResetEnvironment(process.env.NODE_ENV);

  await AppDataSource.initialize();
  try {
    await seedSampleMasterData(AppDataSource, { reset });
    console.log(
      reset
        ? 'Reset và tạo lại catalog Master Data mẫu thành công.'
        : 'Bổ sung catalog Master Data mẫu thành công.',
    );
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error('Seed Master Data mẫu thất bại:', error);
    process.exitCode = 1;
  });
}
