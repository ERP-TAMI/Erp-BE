import 'dotenv/config';
import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';

export type StageGroupSeedItem = {
  stageName: string;
  description: string;
  ssv: string;
  orderIndex: number;
};

export type StageGroupSeed = {
  groupCode: string;
  groupName: string;
  description: string;
  items: readonly StageGroupSeedItem[];
};

const item = (
  stageName: string,
  orderIndex: number,
  description = stageName,
): StageGroupSeedItem => ({
  stageName,
  description,
  ssv: '10',
  orderIndex,
});

export const STAGE_GROUP_SEEDS: readonly StageGroupSeed[] = [
  {
    groupCode: 'NS-1K',
    groupName: 'NS% 1K',
    description: 'Nhóm công đoạn may 1 kim',
    items: [
      item('May lưng HC', 0),
      item('May lưng + may thu + mí', 1),
      item('May lưng HC + dây khoen', 2),
      item('May túi sau HC', 3),
      item('May túi dây keo', 4),
      item('May paget HC', 5),
      item('May lai', 6),
      item('Chít pen thân sau', 7),
      item('Diễu sóng TT', 8),
      item('Diễu sóng TT + patsan', 9),
      item('Diễu đáp túi xéo', 10),
      item('Diễu miệng túi trước', 11),
      item('Diễu paget', 12),
      item('Kẹp mí 1 li miệng túi trước', 13),
      item('Đóng túi vào thân', 14),
      item('Đóng túi vào thân + passant', 15),
      item('Khóa đáy', 16),
      item('Nối lưng', 17),
      item('Kẹp lưng', 18),
      item('Kẹp lưng + nối lưng', 19),
      item('Mí lưng', 20),
      item('Đính patsan', 21),
      item('Đính patsan + khoen', 22),
      item('Đính passant', 23),
      item('Đính passant (2 con x 4 điểm)', 24),
      item('Đính khoen', 25),
      item('Đính dây vào lưng', 26),
      item('Đính đầu lưng', 27),
      item('Nhãn sườn', 28),
    ],
  },
  {
    groupCode: 'NS-VAT-SO',
    groupName: 'NS 1 vắt sổ',
    description: 'Nhóm công đoạn NS 1 vắt sổ',
    items: [
      item('VS3C miệng túi trước', 0),
      item('VS3C lai', 1),
      item('VS3C đáp túi trước', 2),
      item('VS3C đáp túi sau', 3),
      item('VS3C đáp túi xéo', 4),
      item('VS3C lưng lót', 5),
      item('VS5C sườn', 6),
      item('VS5C tra lưng', 7),
      item('VS5C tra lưng + patsan', 8),
      item('VS5C tra lưng sau', 9),
      item('VS sườn', 10),
      item('VS sườn trong + đáy', 11),
      item('VS đáp túi xéo', 12),
      item('VS decup', 13),
      item('Vắt sổ sườn (VA sườn)', 14),
      item('VS lai', 15),
      item('VS3C DTS (định hình/đáp túi sau)', 16, 'VS3C DTS'),
      item('VS3C trước', 17),
    ],
  },
  {
    groupCode: 'NS-UI-CT',
    groupName: 'Ủi chi tiết',
    description: 'Nhóm công đoạn ủi chi tiết & ép keo',
    items: [
      item('Ủi CT – Ủi gấp lưng lót x2', 0),
      item('Ủi CT – Ủi keo thân', 1),
      item('Ủi CT – Ủi keo thân sau', 2),
      item('Ủi CT – Ủi keo túi', 3),
      item('Ủi CT – Ủi keo nẹp túi', 4),
      item('Ủi CT – Ép keo nẹp túi sau', 5),
      item('Ủi CT – Ủi keo lưng', 6),
    ],
  },
];

function buildStageCode(stageName: string): string {
  const slug = stageName
    .replace(/[Đđ]/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `GD-${slug || 'CONG-DOAN'}`.slice(0, 50).replace(/-+$/, '');
}

type ResolvedStage = {
  id: string;
  stage_code: string;
  stage_name: string;
  description: string | null;
  default_ssv: string;
};

type ResolvedGroup = {
  id: string;
  group_code: string;
};

type PersistedGroupItem = {
  stage_group_id: string;
  stage_id: string;
  order_index: number;
};

const normalizeSeedKey = (value: string): string => value.trim().toUpperCase();

export async function seedStageGroups(manager: EntityManager): Promise<void> {
  const seedItems = STAGE_GROUP_SEEDS.flatMap((group) => group.items);
  const stagesByName = new Map<string, StageGroupSeedItem>();
  for (const seedItem of seedItems) {
    stagesByName.set(seedItem.stageName.trim().toUpperCase(), seedItem);
  }
  const prerequisiteStages = [...stagesByName.values()];
  const stagePlaceholders = prerequisiteStages
    .map((_, index) => {
      const offset = index * 4;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
    })
    .join(',\n');
  const stageParameters = prerequisiteStages.flatMap((stage) => [
    buildStageCode(stage.stageName),
    stage.stageName,
    stage.description,
    stage.ssv,
  ]);

  await manager.query(
    `INSERT INTO stages (stage_code, stage_name, description, default_ssv, status)
     SELECT seed.stage_code, seed.stage_name, seed.description, seed.default_ssv::numeric, 'active'::record_status
     FROM (VALUES ${stagePlaceholders}) AS seed(stage_code, stage_name, description, default_ssv)
     WHERE NOT EXISTS (
       SELECT 1 FROM stages existing
       WHERE UPPER(BTRIM(existing.stage_name)) = UPPER(BTRIM(seed.stage_name))
     )
     ON CONFLICT (stage_code) DO NOTHING`,
    stageParameters,
  );

  const expectedStageNames = prerequisiteStages.map((stage) =>
    normalizeSeedKey(stage.stageName),
  );
  const expectedStageCodes = prerequisiteStages.map((stage) =>
    normalizeSeedKey(buildStageCode(stage.stageName)),
  );
  const resolvedStages = (await manager.query(
    `SELECT id, stage_code, stage_name, description, default_ssv
     FROM stages
     WHERE UPPER(BTRIM(stage_name)) = ANY($1::text[])
        OR UPPER(BTRIM(stage_code)) = ANY($2::text[])`,
    [expectedStageNames, expectedStageCodes],
  )) as ResolvedStage[];
  const resolvedStageByName = new Map<string, ResolvedStage>();

  prerequisiteStages.forEach((stage) => {
    const expectedName = normalizeSeedKey(stage.stageName);
    const expectedCode = normalizeSeedKey(buildStageCode(stage.stageName));
    const matches = resolvedStages.filter(
      (candidate) =>
        normalizeSeedKey(candidate.stage_name) === expectedName ||
        normalizeSeedKey(candidate.stage_code) === expectedCode,
    );
    if (
      matches.length !== 1 ||
      normalizeSeedKey(matches[0].stage_name) !== expectedName
    ) {
      const matchSummary = matches
        .map((candidate) => `${candidate.stage_code} (${candidate.stage_name})`)
        .join(', ');
      throw new Error(
        `Cannot seed stage ${expectedCode} (${stage.stageName}): resolved ${
          matchSummary || 'no matching stage'
        }`,
      );
    }
    resolvedStageByName.set(expectedName, matches[0]);
  });

  const groupPlaceholders = STAGE_GROUP_SEEDS.map((_, index) => {
    const offset = index * 3;
    return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
  }).join(',\n');
  const groupParameters = STAGE_GROUP_SEEDS.flatMap((group) => [
    group.groupCode,
    group.groupName,
    group.description,
  ]);
  await manager.query(
    `INSERT INTO stage_groups (group_code, group_name, description, status)
     SELECT group_code, group_name, description, 'active'::record_status
     FROM (VALUES ${groupPlaceholders}) AS seed(group_code, group_name, description)
     ON CONFLICT (group_code) DO NOTHING`,
    groupParameters,
  );

  const resolvedGroups = (await manager.query(
    `SELECT id, group_code
     FROM stage_groups
     WHERE group_code = ANY($1::text[])`,
    [STAGE_GROUP_SEEDS.map((group) => group.groupCode)],
  )) as ResolvedGroup[];
  const resolvedGroupByCode = new Map(
    resolvedGroups.map((group) => [group.group_code, group]),
  );
  for (const group of STAGE_GROUP_SEEDS) {
    if (!resolvedGroupByCode.has(group.groupCode)) {
      throw new Error(
        `Cannot seed stage group ${group.groupCode}: group was not resolved`,
      );
    }
  }

  const seedItemRows = STAGE_GROUP_SEEDS.flatMap((group) => {
    const resolvedGroup = resolvedGroupByCode.get(group.groupCode)!;
    return group.items.map((seedItem) => {
      const resolvedStage = resolvedStageByName.get(
        normalizeSeedKey(seedItem.stageName),
      )!;
      return {
        stageGroupId: resolvedGroup.id,
        stageId: resolvedStage.id,
        orderIndex: seedItem.orderIndex,
        nameSnapshot: resolvedStage.stage_name,
        descriptionSnapshot: resolvedStage.description,
        ssvSnapshot: resolvedStage.default_ssv,
      };
    });
  });
  const itemPlaceholders = seedItemRows
    .map((_, index) => {
      const offset = index * 6;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}::numeric)`;
    })
    .join(',\n');
  const itemParameters = seedItemRows.flatMap((seedItem) => [
    seedItem.stageGroupId,
    seedItem.stageId,
    seedItem.orderIndex,
    seedItem.nameSnapshot,
    seedItem.descriptionSnapshot,
    seedItem.ssvSnapshot,
  ]);

  await manager.query(
    `INSERT INTO stage_group_items (
       stage_group_id,
       stage_id,
       order_index,
       name_snapshot,
       description_snapshot,
       ssv_snapshot
     )
     VALUES ${itemPlaceholders}
     ON CONFLICT (stage_group_id, stage_id) DO NOTHING`,
    itemParameters,
  );

  const persistedItems = (await manager.query(
    `SELECT stage_group_id, stage_id, order_index
     FROM stage_group_items
     WHERE stage_group_id = ANY($1::uuid[])`,
    [resolvedGroups.map((group) => group.id)],
  )) as PersistedGroupItem[];
  for (const group of STAGE_GROUP_SEEDS) {
    const resolvedGroup = resolvedGroupByCode.get(group.groupCode)!;
    const actualItems = persistedItems.filter(
      (persistedItem) => persistedItem.stage_group_id === resolvedGroup.id,
    );
    const hasExpectedItems =
      actualItems.length === group.items.length &&
      group.items.every((seedItem) => {
        const expectedStage = resolvedStageByName.get(
          normalizeSeedKey(seedItem.stageName),
        )!;
        return actualItems.some(
          (persistedItem) =>
            persistedItem.stage_id === expectedStage.id &&
            persistedItem.order_index === seedItem.orderIndex,
        );
      });
    if (!hasExpectedItems) {
      throw new Error(
        `Cannot seed stage group ${group.groupCode}: expected ${group.items.length} ordered items, found ${actualItems.length}`,
      );
    }
  }
}

export async function seedStageGroupCatalog(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.transaction(seedStageGroups);
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await seedStageGroupCatalog(AppDataSource);
    const itemCount = STAGE_GROUP_SEEDS.reduce(
      (count, group) => count + group.items.length,
      0,
    );
    console.log(
      `Ensured ${STAGE_GROUP_SEEDS.length} stage groups with ${itemCount} ordered items.`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Seed stage groups failed:', error);
    process.exitCode = 1;
  });
}
