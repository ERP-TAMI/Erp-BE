import { EntityManager } from 'typeorm';
import { STAGE_SEEDS, seedStages } from './seed-stages';

describe('seedStages', () => {
  it('contains the confirmed stage catalog', () => {
    expect(STAGE_SEEDS).toHaveLength(34);
    expect(STAGE_SEEDS[0]).toEqual({
      stageCode: 'GD-KANSAI-LAI',
      stageName: 'Kansai lai',
      description: 'Kansai lai',
      ssv: '10',
    });
    expect(STAGE_SEEDS.at(-1)).toEqual({
      stageCode: 'GD-BE-DINH-DAU-DAY',
      stageName: 'Bẻ đính đầu dây',
      description: 'Bẻ đính đầu dây',
      ssv: '10',
    });
  });

  it('inserts all stages with parameterized SQL without overwriting existing rows', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as EntityManager;

    await seedStages(manager);

    expect(manager.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (manager.query as jest.Mock).mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(sql).toContain('ON CONFLICT (stage_code) DO NOTHING');
    expect(params).toHaveLength(STAGE_SEEDS.length * 4);
    expect(params.slice(0, 4)).toEqual([
      'GD-KANSAI-LAI',
      'Kansai lai',
      'Kansai lai',
      '10',
    ]);
  });
});
