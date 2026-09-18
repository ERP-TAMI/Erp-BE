import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Make BOM Product Snapshots Nullable
 *
 * Business rule change:
 * - Current PO/Product information is queried dynamically via FK relations
 *   (style_id for Fit BOM, purchase_order_product_id for PO BOM).
 * - product_code_snapshot and product_name_snapshot are no longer mandatory
 *   core snapshots on the BOM header.
 * - This migration relaxes the NOT NULL constraint on product_code_snapshot and
 *   product_name_snapshot in the boms table to prevent insert failures when
 *   creating BOMs without static snapshots.
 */
export class MakeBomProductSnapshotsNullable1740000000033 implements MigrationInterface {
  name = 'MakeBomProductSnapshotsNullable1740000000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE boms
        ALTER COLUMN product_code_snapshot DROP NOT NULL,
        ALTER COLUMN product_name_snapshot DROP NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Backfill NULL product_code_snapshot and product_name_snapshot for FIT BOMs from styles
    await queryRunner.query(`
      UPDATE boms b
      SET
        product_code_snapshot = COALESCE(b.product_code_snapshot, s.style_code, 'UNKNOWN_CODE'),
        product_name_snapshot = COALESCE(b.product_name_snapshot, s.style_name, 'UNKNOWN_NAME')
      FROM styles s
      WHERE b.style_id = s.id
        AND (b.product_code_snapshot IS NULL OR b.product_name_snapshot IS NULL);
    `);

    // 2. Backfill NULL product_code_snapshot and product_name_snapshot for PO BOMs from purchase_order_products
    await queryRunner.query(`
      UPDATE boms b
      SET
        product_code_snapshot = COALESCE(b.product_code_snapshot, pop.product_code, 'UNKNOWN_CODE'),
        product_name_snapshot = COALESCE(b.product_name_snapshot, pop.product_name, 'UNKNOWN_NAME')
      FROM purchase_order_products pop
      WHERE b.purchase_order_product_id = pop.id
        AND (b.product_code_snapshot IS NULL OR b.product_name_snapshot IS NULL);
    `);

    // 3. Fallback for any orphaned/test records
    await queryRunner.query(`
      UPDATE boms
      SET
        product_code_snapshot = COALESCE(product_code_snapshot, 'UNKNOWN_CODE'),
        product_name_snapshot = COALESCE(product_name_snapshot, 'UNKNOWN_NAME')
      WHERE product_code_snapshot IS NULL OR product_name_snapshot IS NULL;
    `);

    // 4. Restore NOT NULL constraint
    await queryRunner.query(`
      ALTER TABLE boms
        ALTER COLUMN product_code_snapshot SET NOT NULL,
        ALTER COLUMN product_name_snapshot SET NOT NULL;
    `);
  }
}
