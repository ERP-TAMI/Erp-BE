import { QueryRunner } from 'typeorm';
import { AddMaterialInventoryAndCostFields1740000000007 } from './migrations/1740000000007-AddMaterialInventoryAndCostFields';

describe('AddMaterialInventoryAndCostFields1740000000007', () => {
  const query = jest.fn<Promise<unknown>, [string]>().mockResolvedValue([]);
  const queryRunner = { query } as unknown as QueryRunner;
  const migration = new AddMaterialInventoryAndCostFields1740000000007();

  beforeEach(() => {
    query.mockClear();
  });

  it('adds only the missing stock constraint and avoids redundant scans', async () => {
    await migration.up(queryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('RENAME COLUMN latest_unit_cost TO last_unit_cost');
    expect(sql).toContain('ADD COLUMN current_stock numeric(18,4)');
    expect(sql).toContain('TYPE numeric(8,4)');
    expect(sql).toContain('ck_materials_current_stock_non_negative');
    expect(sql).not.toContain('ck_materials_default_yield_pct_non_negative');
    expect(sql).not.toContain('ck_materials_last_unit_cost_non_negative');
    expect(sql).not.toContain('ck_materials_low_stock_threshold_non_negative');
    expect(sql).not.toContain('duplicate material codes exist');
    expect(sql).not.toContain('orphan material group references exist');
    expect(sql).not.toContain('orphan default unit references exist');
    expect(sql).not.toContain('null or negative inventory values exist');
  });

  it('guards against overflow before restoring the narrower yield precision', async () => {
    await migration.down(queryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    const guardIndex = sql.indexOf('default_yield_pct > 999.9999');
    const narrowColumnIndex = sql.indexOf('TYPE numeric(7,4)');

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(narrowColumnIndex).toBeGreaterThan(guardIndex);
    expect(sql).toContain('DROP COLUMN current_stock');
    expect(sql).toContain('RENAME COLUMN last_unit_cost TO latest_unit_cost');
  });
});
