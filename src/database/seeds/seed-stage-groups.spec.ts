import { EntityManager } from 'typeorm';
import { STAGE_GROUP_SEEDS, seedStageGroups } from './seed-stage-groups';

describe('seedStageGroups', () => {
  it('contains the three confirmed groups and all 54 independent children', () => {
    expect(STAGE_GROUP_SEEDS.map((group) => group.groupCode)).toEqual([
      'NS-1K',
      'NS-VAT-SO',
      'NS-UI-CT',
    ]);
    expect(STAGE_GROUP_SEEDS.map((group) => group.items.length)).toEqual([
      29, 18, 7,
    ]);
    expect(STAGE_GROUP_SEEDS[0].items[0]).toEqual({
      itemName: 'May lưng HC',
      description: 'May lưng HC',
      ssv: '10',
      orderIndex: 0,
    });
  });

  it('inserts groups and children idempotently without touching Stage Master', async () => {
    const groupIdByCode = new Map<string, string>();
    const manager = {
      query: jest
        .fn()
        .mockImplementation((sql: string, params: unknown[] = []) => {
          if (sql.includes('SELECT id, group_code')) {
            return (params[0] as string[]).map((groupCode, index) => {
              const id = `group-${index}`;
              groupIdByCode.set(groupCode, id);
              return { id, group_code: groupCode };
            });
          }
          if (sql.includes('SELECT stage_group_id, item_name, order_index')) {
            return STAGE_GROUP_SEEDS.flatMap((group) =>
              group.items.map((seedItem) => ({
                stage_group_id: groupIdByCode.get(group.groupCode),
                item_name: seedItem.itemName,
                order_index: seedItem.orderIndex,
              })),
            );
          }
          return [];
        }),
    } as unknown as EntityManager;

    await seedStageGroups(manager);

    expect(manager.query).toHaveBeenCalledTimes(4);
    const allSql = (manager.query as jest.Mock).mock.calls
      .map(([sql]) => sql as string)
      .join('\n');
    const [groupSql, groupParams] = (manager.query as jest.Mock).mock
      .calls[0] as [string, unknown[]];
    const [itemSql, itemParams] = (manager.query as jest.Mock).mock
      .calls[2] as [string, unknown[]];
    expect(groupSql).toContain('ON CONFLICT (group_code) DO NOTHING');
    expect(itemSql).toContain('INSERT INTO stage_group_items');
    expect(itemSql).toContain(
      'ON CONFLICT (stage_group_id, order_index) DO NOTHING',
    );
    expect(allSql).not.toContain('INSERT INTO stages');
    expect(allSql).not.toContain('FROM stages');
    expect(groupParams).toContain('NS-UI-CT');
    expect(itemParams).toContain('Ủi CT – Ủi keo lưng');
  });

  it('fails instead of accepting an incomplete persisted catalog', async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'group-1', group_code: 'NS-1K' },
          { id: 'group-2', group_code: 'NS-VAT-SO' },
        ]),
    } as unknown as EntityManager;

    await expect(seedStageGroups(manager)).rejects.toThrow(/NS-UI-CT/);
  });
});
