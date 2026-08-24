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
    const manager = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as EntityManager;

    await seedStageGroups(manager);

    expect(manager.query).toHaveBeenCalledTimes(2);
    const [stageSql, stageParams] = (manager.query as jest.Mock).mock
      .calls[0] as [string, unknown[]];
    const [groupSql, groupParams] = (manager.query as jest.Mock).mock
      .calls[1] as [string, unknown[]];
    expect(stageSql).toContain('ON CONFLICT (stage_code) DO NOTHING');
    expect(stageSql).toContain('UPPER(BTRIM(existing.stage_name))');
    expect(stageSql).toContain('seed.default_ssv::numeric');
    expect(groupSql).toContain('ON CONFLICT (group_code) DO NOTHING');
    expect(groupSql).toContain('INSERT INTO stage_group_items');
    expect(groupSql).toContain('seed_items.order_index::integer');
    expect(stageParams).toContain('May lưng HC');
    expect(groupParams).toContain('NS-UI-CT');
    expect(groupParams).toContain('Ủi CT – Ủi keo lưng');
  });
});
