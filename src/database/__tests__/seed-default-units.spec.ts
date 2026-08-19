import { QueryRunner } from 'typeorm';
import { SeedDefaultUnits1770000000000 } from '../migrations/1770000000000-SeedDefaultUnits';

describe('SeedDefaultUnits migration', () => {
  it('inserts default active units without overwriting existing codes', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new SeedDefaultUnits1770000000000();

    await migration.up({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('INSERT INTO units');
    expect(query.mock.calls[0][0]).toContain("'active'");
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (code) DO NOTHING');
    expect(query.mock.calls[0][0]).toContain("'PCS'");
    expect(query.mock.calls[0][0]).toContain("'M'");
    expect(query.mock.calls[0][0]).toContain("'KG'");
    expect(query.mock.calls[0][0]).toContain("'ROLL'");
    expect(query.mock.calls[0][0]).toContain("'L'");
  });

  it('removes only unreferenced rows owned by this migration', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new SeedDefaultUnits1770000000000();

    await migration.down({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('DELETE FROM units');
    expect(query.mock.calls[0][0]).toContain('NOT EXISTS');
    expect(query.mock.calls[0][0]).toContain('materials');
    expect(query.mock.calls[0][0]).toContain('draft_bom_lines');
  });
});
