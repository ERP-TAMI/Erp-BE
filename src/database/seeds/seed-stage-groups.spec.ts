import { EntityManager } from 'typeorm';
import { STAGE_GROUP_SEEDS, seedStageGroups } from './seed-stage-groups';

describe('seedStageGroups', () => {
  it('contains the three confirmed groups and all 54 ordered items', () => {
    expect(STAGE_GROUP_SEEDS.map((group) => group.groupCode)).toEqual([
      'NS-1K',
      'NS-VAT-SO',
      'NS-UI-CT',
    ]);
    expect(STAGE_GROUP_SEEDS.map((group) => group.items.length)).toEqual([
      29, 18, 7,
    ]);
    expect(STAGE_GROUP_SEEDS[0].items[0]).toEqual({
      stageName: 'May lưng HC',
      description: 'May lưng HC',
      ssv: '10',
      orderIndex: 0,
    });
  });

  it('inserts prerequisites and groups with parameterized idempotent SQL', async () => {
    const stageIdByName = new Map<string, string>();
    const groupIdByCode = new Map<string, string>();
    const manager = {
      query: jest
        .fn()
        .mockImplementation((sql: string, params: unknown[] = []) => {
          if (sql.includes('SELECT id, stage_code')) {
            const names = params[0] as string[];
            const codes = params[1] as string[];
            return names.map((stageName, index) => {
              const id = `stage-${index}`;
              stageIdByName.set(stageName, id);
              const seedItem = STAGE_GROUP_SEEDS.flatMap(
                (group) => group.items,
              ).find(
                (item) => item.stageName.trim().toUpperCase() === stageName,
              )!;
              return {
                id,
                stage_code: codes[index],
                stage_name: seedItem.stageName,
                description: seedItem.description,
                default_ssv: '10.000',
              };
            });
          }
          if (sql.includes('SELECT id, group_code')) {
            return (params[0] as string[]).map((groupCode, index) => {
              const id = `group-${index}`;
              groupIdByCode.set(groupCode, id);
              return { id, group_code: groupCode };
            });
          }
          if (sql.includes('SELECT stage_group_id, stage_id, order_index')) {
            return STAGE_GROUP_SEEDS.flatMap((group) =>
              group.items.map((seedItem) => ({
                stage_group_id: groupIdByCode.get(group.groupCode),
                stage_id: stageIdByName.get(
                  seedItem.stageName.trim().toUpperCase(),
                ),
                order_index: seedItem.orderIndex,
              })),
            );
          }
          return [];
        }),
    } as unknown as EntityManager;

    await seedStageGroups(manager);

    expect(manager.query).toHaveBeenCalledTimes(6);
    const [stageSql, stageParams] = (manager.query as jest.Mock).mock
      .calls[0] as [string, unknown[]];
    const [groupSql, groupParams] = (manager.query as jest.Mock).mock
      .calls[2] as [string, unknown[]];
    const [itemSql, itemParams] = (manager.query as jest.Mock).mock
      .calls[4] as [string, unknown[]];
    expect(stageSql).toContain('ON CONFLICT (stage_code) DO NOTHING');
    expect(stageSql).toContain('UPPER(BTRIM(existing.stage_name))');
    expect(stageSql).toContain('seed.default_ssv::numeric');
    expect(groupSql).toContain('ON CONFLICT (group_code) DO NOTHING');
    expect(itemSql).toContain('INSERT INTO stage_group_items');
    expect(itemSql).toContain(
      'ON CONFLICT (stage_group_id, stage_id) DO NOTHING',
    );
    expect(stageParams).toContain('May lưng HC');
    expect(groupParams).toContain('NS-UI-CT');
    expect(itemParams).toContain('Ủi CT – Ủi keo lưng');
  });

  it('fails instead of creating an incomplete catalog when a generated stage code belongs to another name', async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: '771c0dc2-cd59-44e3-9b16-cacb200f20e5',
            stage_code: 'GD-MAY-LUNG-HC',
            stage_name: 'Công đoạn khác',
            description: null,
            default_ssv: '10.000',
          },
        ]),
    } as unknown as EntityManager;

    await expect(seedStageGroups(manager)).rejects.toThrow(
      /GD-MAY-LUNG-HC.*Công đoạn khác/,
    );
  });
});
