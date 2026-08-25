import 'dotenv/config';
import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';

export type StageGroupSeedItem = {
  itemName: string;
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
  itemName: string,
  orderIndex: number,
  description = itemName,
): StageGroupSeedItem => ({
  itemName,
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

type ResolvedGroup = { id: string; group_code: string };
type PersistedGroupItem = {
  stage_group_id: string;
  item_name: string;
  order_index: number;
};

export async function seedStageGroups(manager: EntityManager): Promise<void> {
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
    return group.items.map((seedItem) => ({
      stageGroupId: resolvedGroup.id,
      itemName: seedItem.itemName,
      description: seedItem.description,
      ssv: seedItem.ssv,
      orderIndex: seedItem.orderIndex,
    }));
  });
  const itemPlaceholders = seedItemRows
    .map((_, index) => {
      const offset = index * 5;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}::numeric, $${offset + 5})`;
    })
    .join(',\n');
  const itemParameters = seedItemRows.flatMap((seedItem) => [
    seedItem.stageGroupId,
    seedItem.itemName,
    seedItem.description,
    seedItem.ssv,
    seedItem.orderIndex,
  ]);

  await manager.query(
    `INSERT INTO stage_group_items (
       stage_group_id, item_name, description, ssv, order_index, status
     )
     SELECT stage_group_id::uuid, item_name, description, ssv,
            order_index::integer, 'active'::record_status
     FROM (VALUES ${itemPlaceholders}) AS seed(
       stage_group_id, item_name, description, ssv, order_index
     )
     ON CONFLICT (stage_group_id, order_index) DO NOTHING`,
    itemParameters,
  );

  const persistedItems = (await manager.query(
    `SELECT stage_group_id, item_name, order_index
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
      group.items.every((seedItem) =>
        actualItems.some(
          (persistedItem) =>
            persistedItem.item_name === seedItem.itemName &&
            persistedItem.order_index === seedItem.orderIndex,
        ),
      );
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
    console.log('Stage group catalog seed completed');
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
