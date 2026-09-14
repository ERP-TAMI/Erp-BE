import { QueryRunner } from 'typeorm';
import { MakeRevisionNoNullableAndAddPartialUniqueIndex1740000000023 } from './migrations/1740000000023-MakeRevisionNoNullableAndAddPartialUniqueIndex';

describe('MakeRevisionNoNullableAndAddPartialUniqueIndex1740000000023', () => {
  const migration =
    new MakeRevisionNoNullableAndAddPartialUniqueIndex1740000000023();

  describe('up()', () => {
    it('makes revision_no nullable and adds partial unique indexes for both Fit and PO BOMs', async () => {
      const query = jest.fn<Promise<unknown>, [string]>().mockResolvedValue([]);
      const queryRunner = { query } as unknown as QueryRunner;

      await migration.up(queryRunner);

      const sql = query.mock.calls.map(([statement]) => statement).join('\n');

      // Fit BOM revisions
      expect(sql).toContain(
        'ALTER TABLE fit_bom_revisions ALTER COLUMN revision_no DROP NOT NULL;',
      );
      expect(sql).toContain('DROP CONSTRAINT IF EXISTS uq_fit_bom_revision;');
      expect(sql).toContain(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_fit_bom_revision',
      );
      expect(sql).toContain('ON fit_bom_revisions (style_id, revision_no)');
      expect(sql).toContain('WHERE revision_no IS NOT NULL;');

      // PO BOM revisions
      expect(sql).toContain(
        'ALTER TABLE bom_revisions ALTER COLUMN revision_no DROP NOT NULL;',
      );
      expect(sql).toContain('DROP CONSTRAINT IF EXISTS uq_bom_revision;');
      expect(sql).toContain(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_bom_revision',
      );
      expect(sql).toContain(
        'ON bom_revisions (bill_of_material_id, revision_no)',
      );
      expect(sql).toContain('WHERE revision_no IS NOT NULL;');
    });
  });

  describe('down()', () => {
    it('guards rollback by checking for NULL revision_no in both tables before restoring NOT NULL', async () => {
      const query = jest.fn<Promise<unknown>, [string]>().mockResolvedValue([]);
      const queryRunner = { query } as unknown as QueryRunner;

      await migration.down(queryRunner);

      const sql = query.mock.calls.map(([statement]) => statement).join('\n');

      // 1. Verify safety preflight check exists
      expect(sql).toContain(
        'SELECT 1 FROM fit_bom_revisions WHERE revision_no IS NULL',
      );
      expect(sql).toContain(
        'SELECT 1 FROM bom_revisions WHERE revision_no IS NULL',
      );
      expect(sql).toContain('RAISE EXCEPTION');
      expect(sql).toContain('Cannot revert migration 1740000000023');
      expect(sql).toContain(
        'draft/in_review/cancelled revisions without a business revision number',
      );

      // 2. Verify no auto-assignment of revision numbers
      expect(sql).not.toContain('UPDATE fit_bom_revisions');
      expect(sql).not.toContain('UPDATE bom_revisions');

      // 3. Verify order: preflight check must happen before restoring SET NOT NULL
      const guardIndex = sql.indexOf('RAISE EXCEPTION');
      const setNotNullBomIndex = sql.indexOf(
        'ALTER TABLE bom_revisions ALTER COLUMN revision_no SET NOT NULL',
      );
      const setNotNullFitIndex = sql.indexOf(
        'ALTER TABLE fit_bom_revisions ALTER COLUMN revision_no SET NOT NULL',
      );

      expect(guardIndex).toBeGreaterThanOrEqual(0);
      expect(setNotNullBomIndex).toBeGreaterThan(guardIndex);
      expect(setNotNullFitIndex).toBeGreaterThan(guardIndex);

      // 4. Verify original unique constraints restored
      expect(sql).toContain('DROP INDEX IF EXISTS uq_bom_revision;');
      expect(sql).toContain(
        'ALTER TABLE bom_revisions ADD CONSTRAINT uq_bom_revision UNIQUE (bill_of_material_id, revision_no);',
      );
      expect(sql).toContain('DROP INDEX IF EXISTS uq_fit_bom_revision;');
      expect(sql).toContain(
        'ALTER TABLE fit_bom_revisions ADD CONSTRAINT uq_fit_bom_revision UNIQUE (style_id, revision_no);',
      );
    });

    it('aborts rollback when preflight guard detects NULL revision_no', async () => {
      const query = jest
        .fn<Promise<unknown>, [string]>()
        .mockImplementation(async (sql: string) => {
          if (
            sql.includes(
              'SELECT 1 FROM fit_bom_revisions WHERE revision_no IS NULL',
            )
          ) {
            throw new Error(
              'Cannot revert migration 1740000000023: draft/in_review/cancelled revisions without a business revision number (revision_no IS NULL) still exist in fit_bom_revisions or bom_revisions. Rollback aborted.',
            );
          }
          return [];
        });
      const queryRunner = { query } as unknown as QueryRunner;

      await expect(migration.down(queryRunner)).rejects.toThrow(
        /Cannot revert migration 1740000000023.*draft\/in_review\/cancelled revisions without a business revision number/,
      );

      // Schema modifications must NOT have been called after the abort
      const calls = query.mock.calls.map(([statement]) => statement).join('\n');
      expect(calls).not.toContain(
        'ALTER TABLE bom_revisions ALTER COLUMN revision_no SET NOT NULL',
      );
      expect(calls).not.toContain(
        'ALTER TABLE fit_bom_revisions ALTER COLUMN revision_no SET NOT NULL',
      );
    });
  });
});
