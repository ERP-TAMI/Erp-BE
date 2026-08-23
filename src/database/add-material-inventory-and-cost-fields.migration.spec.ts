import { QueryRunner } from 'typeorm';
import { AddMaterialInventoryAndCostFields1740000000007 } from './migrations/1740000000007-AddMaterialInventoryAndCostFields';

describe('AddMaterialInventoryAndCostFields1740000000007', () => {
  const query = jest.fn<Promise<unknown>, [string]>().mockResolvedValue([]);
  const queryRunner = { query } as unknown as QueryRunner;
  const migration = new AddMaterialInventoryAndCostFields1740000000007();

  beforeEach(() => {
    query.mockClear();
  });

  it('adds the material inventory contract without modifying an old migration', async () => {
    await migration.up(queryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('RENAME COLUMN latest_unit_cost TO last_unit_cost');
    expect(sql).toContain('ADD COLUMN current_stock numeric(18,4)');
    expect(sql).toContain('TYPE numeric(8,4)');
    expect(sql).toContain('ck_materials_default_yield_pct_non_negative');
    expect(sql).toContain('ck_materials_last_unit_cost_non_negative');
    expect(sql).toContain('ck_materials_current_stock_non_negative');
    expect(sql).toContain('ck_materials_low_stock_threshold_non_negative');
  });

  it('restores the previous material schema on rollback', async () => {
    await migration.down(queryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('DROP COLUMN current_stock');
    expect(sql).toContain('RENAME COLUMN last_unit_cost TO latest_unit_cost');
    expect(sql).toContain('TYPE numeric(7,4)');
  });
});
