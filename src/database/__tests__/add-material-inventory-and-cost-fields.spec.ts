import { QueryRunner } from 'typeorm';
import { AddMaterialInventoryAndCostFields1750000000000 } from '../migrations/1750000000000-AddMaterialInventoryAndCostFields';

describe('AddMaterialInventoryAndCostFields1750000000000', () => {
  it('adds material numeric fields with non-negative constraints', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new AddMaterialInventoryAndCostFields1750000000000();

    await migration.up({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('default_yield_pct');
    expect(sql).toContain('last_unit_cost');
    expect(sql).toContain('current_stock');
    expect(sql).toContain('low_stock_threshold');
    expect(sql).toContain('CHECK (default_yield_pct >= 0)');
    expect(sql).toContain('CHECK (last_unit_cost >= 0)');
    expect(sql).toContain('CHECK (current_stock >= 0)');
    expect(sql).toContain('CHECK (low_stock_threshold >= 0)');
  });

  it('removes constraints before removing the new columns', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new AddMaterialInventoryAndCostFields1750000000000();

    await migration.down({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain(
      'DROP CONSTRAINT ck_materials_default_yield_pct_non_negative',
    );
    expect(sql).toContain('DROP COLUMN low_stock_threshold');
  });
});
