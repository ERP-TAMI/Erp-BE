import { QueryRunner } from 'typeorm';
import { ChangePoBomOwnerFromColorToProduct1740000000032 } from './migrations/1740000000032-ChangePoBomOwnerFromColorToProduct';

describe('ChangePoBomOwnerFromColorToProduct migration', () => {
  let migration: ChangePoBomOwnerFromColorToProduct1740000000032;

  beforeEach(() => {
    migration = new ChangePoBomOwnerFromColorToProduct1740000000032();
  });

  describe('up()', () => {
    it('successfully executes schema migration and data backfill when data is valid and collision-free', async () => {
      const executedQueries: string[] = [];
      const queryRunner = {
        query: jest.fn().mockImplementation(async (sql: string) => {
          executedQueries.push(sql);
          // Return empty results for checks (no collisions, no invalid boms)
          return [];
        }),
      } as unknown as QueryRunner;

      await migration.up(queryRunner);

      const allSql = executedQueries.join('\n');

      // 1. Adds column purchase_order_product_id
      expect(allSql).toContain('ADD COLUMN purchase_order_product_id uuid');

      // 2. Adds FK to purchase_order_products
      expect(allSql).toContain('ADD CONSTRAINT fk_boms_purchase_order_product');
      expect(allSql).toContain('REFERENCES purchase_order_products(id)');

      // 3. Backfills purchase_order_product_id
      expect(allSql).toContain('UPDATE boms b');
      expect(allSql).toContain(
        'SET purchase_order_product_id = popc.product_id',
      );
      expect(allSql).toContain('FROM purchase_order_product_colors popc');

      // 4. Drops old constraints and column
      expect(allSql).toContain('DROP CONSTRAINT IF EXISTS ck_bom_owner');
      expect(allSql).toContain('DROP INDEX IF EXISTS uq_boms_po_product_color');
      expect(allSql).toContain(
        'DROP CONSTRAINT IF EXISTS boms_product_color_id_fkey',
      );
      expect(allSql).toContain('DROP COLUMN IF EXISTS product_color_id');

      // 5. Creates new unique index on purchase_order_product_id
      expect(allSql).toContain('CREATE UNIQUE INDEX uq_boms_po_product');
      expect(allSql).toContain('ON boms(purchase_order_product_id)');

      // 6. Adds updated ownership check constraint
      expect(allSql).toContain("bom_type = 'po'");
      expect(allSql).toContain('purchase_order_product_id IS NOT NULL');
      expect(allSql).toContain("bom_type = 'fit'");
      expect(allSql).toContain('purchase_order_product_id IS NULL');
    });

    it('FAILS FAST when multiple PO BOMs exist for the same purchase_order_product (data collision)', async () => {
      const collisionRecord = [
        {
          purchase_order_product_id: 'prod-uuid-1111',
          bom_count: 2,
          bom_ids: 'bom-uuid-1, bom-uuid-2',
          bom_codes: 'BOM-PO-01-RED, BOM-PO-01-BLUE',
          product_codes: 'PROD-SHIRT-A',
          color_names: 'Red, Blue',
        },
      ];

      const queryRunner = {
        query: jest.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('HAVING COUNT(*) > 1')) {
            return collisionRecord;
          }
          return [];
        }),
      } as unknown as QueryRunner;

      await expect(migration.up(queryRunner)).rejects.toThrow(
        /Cannot migrate PO BOM ownership from product_color to product because one or more products currently have multiple BOMs/,
      );

      // Verify the error details contain critical context
      try {
        await migration.up(queryRunner);
      } catch (err: any) {
        expect(err.message).toContain('prod-uuid-1111');
        expect(err.message).toContain('PROD-SHIRT-A');
        expect(err.message).toContain('2 BOMs');
        expect(err.message).toContain('BOM-PO-01-RED, BOM-PO-01-BLUE');
        expect(err.message).toContain('bom-uuid-1, bom-uuid-2');
        expect(err.message).toContain('Red, Blue');
      }
    });

    it('FAILS FAST when a PO BOM cannot be mapped to a purchase_order_product', async () => {
      const invalidPoBoms = [
        {
          id: 'bom-bad-1',
          bom_code: 'BOM-INVALID',
          product_color_id: 'color-orphan',
        },
      ];

      const queryRunner = {
        query: jest.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('HAVING COUNT(*) > 1')) {
            return [];
          }
          if (
            sql.includes("b.bom_type = 'po'") &&
            sql.includes('b.purchase_order_product_id IS NULL')
          ) {
            return invalidPoBoms;
          }
          return [];
        }),
      } as unknown as QueryRunner;

      await expect(migration.up(queryRunner)).rejects.toThrow(
        /The following PO BOMs could not be mapped to a valid purchase_order_product: BOM-INVALID \(bom-bad-1\)/,
      );
    });

    it('FAILS FAST when a FIT BOM has an unexpected purchase_order_product_id', async () => {
      const invalidFitBoms = [{ id: 'fit-bad-1', bom_code: 'BOM-FIT-BAD' }];

      const queryRunner = {
        query: jest.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('HAVING COUNT(*) > 1')) return [];
          if (sql.includes('b.purchase_order_product_id IS NULL')) return [];
          if (
            sql.includes("b.bom_type = 'fit'") &&
            sql.includes('purchase_order_product_id IS NOT NULL')
          ) {
            return invalidFitBoms;
          }
          return [];
        }),
      } as unknown as QueryRunner;

      await expect(migration.up(queryRunner)).rejects.toThrow(
        /FIT BOMs must not have purchase_order_product_id: BOM-FIT-BAD \(fit-bad-1\)/,
      );
    });
  });

  describe('down()', () => {
    it('aborts rollback when a product has multiple colors (ambiguous owner)', async () => {
      const queryRunner = {
        query: jest.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('COUNT(popc.id)::int AS color_count')) {
            return [
              {
                id: 'bom-1',
                bom_code: 'BOM-001',
                purchase_order_product_id: 'prod-1',
                color_count: 3,
                color_names: 'Red, Blue, Green',
              },
            ];
          }
          return [];
        }),
      } as unknown as QueryRunner;

      await expect(migration.down(queryRunner)).rejects.toThrow(
        /Cannot safely revert migration: The following PO BOMs belong to products with multiple colors/,
      );
    });

    it('aborts rollback when a product has no colors in purchase_order_product_colors', async () => {
      const queryRunner = {
        query: jest.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('COUNT(popc.id)::int AS color_count')) {
            return [];
          }
          if (sql.includes('popc.id IS NULL')) {
            return [
              {
                id: 'bom-1',
                bom_code: 'BOM-001',
                purchase_order_product_id: 'prod-no-color',
              },
            ];
          }
          return [];
        }),
      } as unknown as QueryRunner;

      await expect(migration.down(queryRunner)).rejects.toThrow(
        /The following PO BOMs have no corresponding colors in purchase_order_product_colors/,
      );
    });

    it('restores schema safely when all products map unambiguously to exactly 1 color', async () => {
      const executedQueries: string[] = [];
      const queryRunner = {
        query: jest.fn().mockImplementation(async (sql: string) => {
          executedQueries.push(sql);
          return [];
        }),
      } as unknown as QueryRunner;

      await migration.down(queryRunner);

      const allSql = executedQueries.join('\n');
      expect(allSql).toContain('ADD COLUMN product_color_id uuid');
      expect(allSql).toContain('ADD CONSTRAINT boms_product_color_id_fkey');
      expect(allSql).toContain('SET product_color_id = popc.id');
      expect(allSql).toContain('DROP INDEX IF EXISTS uq_boms_po_product');
      expect(allSql).toContain(
        'DROP COLUMN IF EXISTS purchase_order_product_id',
      );
      expect(allSql).toContain('CREATE UNIQUE INDEX uq_boms_po_product_color');
      expect(allSql).toContain('product_color_id IS NOT NULL');
    });
  });
});
