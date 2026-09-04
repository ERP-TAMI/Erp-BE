import { DataSource, EntityManager } from 'typeorm';
import {
  MATERIAL_GROUP_SEEDS,
  MATERIAL_SEEDS,
  SIZE_CHART_SEEDS,
  STABLE_SAMPLE_IDS,
  WORKSHOP_SEEDS,
  stableSampleId,
} from './sample-master-data';
import {
  assertResetEnvironment,
  seedSampleMasterData,
} from './seed-master-data';

describe('sample master data catalog', () => {
  it('uses deterministic IDs that do not depend on catalog ordering', () => {
    expect(stableSampleId('material', 'FUS-BLK')).toBe(
      stableSampleId('material', 'FUS-BLK'),
    );
    expect(stableSampleId('material', 'FUS-BLK')).not.toBe(
      stableSampleId('material', 'FUS-WHT'),
    );
    expect(stableSampleId('material', 'FUS-BLK')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(STABLE_SAMPLE_IDS.materials['FUS-BLK']).toBe(
      stableSampleId('material', 'FUS-BLK'),
    );
  });

  it('contains a unique and fully referenced catalog from the demo', () => {
    expect(MATERIAL_GROUP_SEEDS).toHaveLength(14);
    expect(WORKSHOP_SEEDS.map((item) => item.workshopCode)).toEqual([
      'BM-01',
      'X-01',
      'X-02',
      'X-03',
      'X-04',
      'X-05',
      'X-06',
      'X-07',
      'X-08',
    ]);
    expect(SIZE_CHART_SEEDS).toHaveLength(3);

    const groupNames = MATERIAL_GROUP_SEEDS.map((item) => item.name);
    const materialCodes = MATERIAL_SEEDS.map((item) => item.materialCode);
    const chartNames = SIZE_CHART_SEEDS.map((item) => item.name);
    expect(new Set(groupNames).size).toBe(groupNames.length);
    expect(new Set(materialCodes).size).toBe(materialCodes.length);
    expect(new Set(chartNames).size).toBe(chartNames.length);
    expect(
      MATERIAL_SEEDS.every((item) => groupNames.includes(item.groupName)),
    ).toBe(true);
    expect(
      MATERIAL_GROUP_SEEDS.every((group) =>
        MATERIAL_SEEDS.some((material) => material.groupName === group.name),
      ),
    ).toBe(true);
    expect(
      SIZE_CHART_SEEDS.every(
        (chart) =>
          chart.sizes.length > 0 &&
          new Set(chart.sizes).size === chart.sizes.length,
      ),
    ).toBe(true);
  });
});

describe('seedSampleMasterData', () => {
  it.each(['local', 'development', 'test', 'staging'])(
    'allows reset in %s',
    (nodeEnv) => {
      expect(() => assertResetEnvironment(nodeEnv)).not.toThrow();
    },
  );

  it.each([undefined, 'production', 'preview'])(
    'blocks reset in %s',
    (nodeEnv) => {
      expect(() => assertResetEnvironment(nodeEnv)).toThrow(
        /local, development, test hoặc staging/,
      );
    },
  );

  it('runs reset and ensure in the same transaction', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(async (work: (value: EntityManager) => unknown) =>
        work(manager),
      ),
    } as unknown as DataSource;

    await seedSampleMasterData(dataSource, {
      reset: true,
      nodeEnv: 'test',
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    const sql = (manager.query as jest.Mock).mock.calls
      .map(([statement]) => statement as string)
      .join('\n');
    expect(sql).toContain('DELETE FROM materials');
    expect(sql).toContain('INSERT INTO material_groups');
    expect(sql).toContain('INSERT INTO size_chart_items');
    expect(sql).toContain('WITH inserted_stage_groups AS');
    expect(sql).toContain('WITH inserted_size_charts AS');
  });
});
