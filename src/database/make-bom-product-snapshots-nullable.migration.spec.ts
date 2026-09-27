import { QueryRunner } from 'typeorm';
import { MakeBomProductSnapshotsNullable1740000000033 } from './migrations/1740000000033-MakeBomProductSnapshotsNullable';

describe('MakeBomProductSnapshotsNullable migration', () => {
  let migration: MakeBomProductSnapshotsNullable1740000000033;

  beforeEach(() => {
    migration = new MakeBomProductSnapshotsNullable1740000000033();
  });

  describe('up()', () => {
    it('successfully drops NOT NULL constraints on product_code_snapshot and product_name_snapshot', async () => {
      const executedQueries: string[] = [];
      const queryRunner = {
        query: jest.fn().mockImplementation(async (sql: string) => {
          executedQueries.push(sql);
          return [];
        }),
      } as unknown as QueryRunner;

      await migration.up(queryRunner);

      const allSql = executedQueries.join('\n');
      expect(allSql).toContain('ALTER TABLE boms');
      expect(allSql).toContain(
        'ALTER COLUMN product_code_snapshot DROP NOT NULL',
      );
      expect(allSql).toContain(
        'ALTER COLUMN product_name_snapshot DROP NOT NULL',
      );
    });
  });

  describe('down()', () => {
    it('backfills null snapshots before restoring NOT NULL constraints', async () => {
      const executedQueries: string[] = [];
      const queryRunner = {
        query: jest.fn().mockImplementation(async (sql: string) => {
          executedQueries.push(sql);
          return [];
        }),
      } as unknown as QueryRunner;

      await migration.down(queryRunner);

      const allSql = executedQueries.join('\n');
      // 1. Backfill FIT BOMs from styles
      expect(allSql).toContain('FROM styles s');
      expect(allSql).toContain('b.style_id = s.id');

      // 2. Backfill PO BOMs from purchase_order_products
      expect(allSql).toContain('FROM purchase_order_products pop');
      expect(allSql).toContain('b.purchase_order_product_id = pop.id');

      // 3. Fallback for orphaned records
      expect(allSql).toContain(
        "COALESCE(product_code_snapshot, 'UNKNOWN_CODE')",
      );

      // 4. Restore NOT NULL
      expect(allSql).toContain(
        'ALTER COLUMN product_code_snapshot SET NOT NULL',
      );
      expect(allSql).toContain(
        'ALTER COLUMN product_name_snapshot SET NOT NULL',
      );
    });
  });
});
