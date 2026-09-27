import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Change PO BOM Owner From Color To Product
 *
 * Business rule change:
 * - BEFORE: 1 Product has multiple Colors -> each Color had 1 PO BOM (owner = product_color_id).
 * - AFTER: 1 Product in PO has exactly 1 PO BOM -> all Colors share that BOM (owner = purchase_order_product_id).
 * - Fit BOM remains untouched (owner = style_id).
 */
export class ChangePoBomOwnerFromColorToProduct1740000000032 implements MigrationInterface {
  name = 'ChangePoBomOwnerFromColorToProduct1740000000032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add column purchase_order_product_id (nullable initially for backfill)
    await queryRunner.query(`
      ALTER TABLE boms
        ADD COLUMN purchase_order_product_id uuid;
    `);

    // 2. Add foreign key to purchase_order_products(id)
    await queryRunner.query(`
      ALTER TABLE boms
        ADD CONSTRAINT fk_boms_purchase_order_product
        FOREIGN KEY (purchase_order_product_id)
        REFERENCES purchase_order_products(id)
        ON DELETE RESTRICT;
    `);

    // 3. Backfill purchase_order_product_id from purchase_order_product_colors
    await queryRunner.query(`
      UPDATE boms b
      SET purchase_order_product_id = popc.product_id
      FROM purchase_order_product_colors popc
      WHERE b.product_color_id = popc.id
        AND b.bom_type = 'po';
    `);

    // 4. Data Collision Detection - FAIL FAST
    // Check if any purchase_order_product has more than 1 PO BOM
    const collisions = await queryRunner.query(`
      SELECT
        b.purchase_order_product_id,
        COUNT(*)::int AS bom_count,
        string_agg(b.id::text, ', ') AS bom_ids,
        string_agg(b.bom_code, ', ') AS bom_codes,
        string_agg(DISTINCT b.product_code_snapshot, ', ') AS product_codes,
        string_agg(DISTINCT COALESCE(b.color_name_snapshot, 'N/A'), ', ') AS color_names
      FROM boms b
      WHERE b.bom_type = 'po'
        AND b.purchase_order_product_id IS NOT NULL
      GROUP BY b.purchase_order_product_id
      HAVING COUNT(*) > 1;
    `);

    if (collisions && collisions.length > 0) {
      const details = collisions
        .map(
          (c: any) =>
            `- Product ID ${c.purchase_order_product_id} (Code: ${c.product_codes}): has ${c.bom_count} BOMs [Codes: ${c.bom_codes}] [IDs: ${c.bom_ids}] [Colors: ${c.color_names}]`,
        )
        .join('\n');
      throw new Error(
        `Cannot migrate PO BOM ownership from product_color to product because one or more products currently have multiple BOMs generated from different colors:\n${details}\nMigration aborted to prevent data loss.`,
      );
    }

    // 5. Data Validation
    // 5.1. Ensure all PO BOMs have a non-null purchase_order_product_id
    const invalidPoBoms = await queryRunner.query(`
      SELECT b.id, b.bom_code, b.product_color_id
      FROM boms b
      WHERE b.bom_type = 'po'
        AND (b.purchase_order_product_id IS NULL);
    `);

    if (invalidPoBoms && invalidPoBoms.length > 0) {
      const ids = invalidPoBoms
        .map((b: any) => `${b.bom_code} (${b.id})`)
        .join(', ');
      throw new Error(
        `Cannot migrate PO BOM: The following PO BOMs could not be mapped to a valid purchase_order_product: ${ids}`,
      );
    }

    // 5.2. Ensure FIT BOMs DO NOT have purchase_order_product_id
    const invalidFitBoms = await queryRunner.query(`
      SELECT b.id, b.bom_code
      FROM boms b
      WHERE b.bom_type = 'fit'
        AND b.purchase_order_product_id IS NOT NULL;
    `);

    if (invalidFitBoms && invalidFitBoms.length > 0) {
      const ids = invalidFitBoms
        .map((b: any) => `${b.bom_code} (${b.id})`)
        .join(', ');
      throw new Error(
        `Data integrity error: FIT BOMs must not have purchase_order_product_id: ${ids}`,
      );
    }

    // 6. Drop old ownership check constraint
    await queryRunner.query(`
      ALTER TABLE boms
        DROP CONSTRAINT IF EXISTS ck_bom_owner;
    `);

    // 7. Drop old partial unique index on product_color_id
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_boms_po_product_color;
    `);

    // 8. Drop FK constraint on product_color_id deterministically
    await queryRunner.query(`
      ALTER TABLE boms
        DROP CONSTRAINT IF EXISTS boms_product_color_id_fkey;
    `);

    // 9. Drop column product_color_id
    await queryRunner.query(`
      ALTER TABLE boms
        DROP COLUMN IF EXISTS product_color_id;
    `);

    // 10. Create new partial unique index for PO BOM on purchase_order_product_id
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_boms_po_product
        ON boms(purchase_order_product_id)
        WHERE bom_type = 'po' AND purchase_order_product_id IS NOT NULL;
    `);

    // 11. Add new ownership check constraint
    await queryRunner.query(`
      ALTER TABLE boms
        ADD CONSTRAINT ck_bom_owner CHECK (
          (
            bom_type = 'fit'
            AND style_id IS NOT NULL
            AND purchase_order_product_id IS NULL
          )
          OR
          (
            bom_type = 'po'
            AND style_id IS NULL
            AND purchase_order_product_id IS NOT NULL
          )
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Ambiguity & Safety Check before rollback
    // Rolling back from product-level BOM to color-level BOM is lossy and unsafe
    // if a product has > 1 color or 0 colors, as we cannot arbitrarily guess which color owns the BOM.
    const multiColorCollisions = await queryRunner.query(`
      SELECT
        b.id,
        b.bom_code,
        b.purchase_order_product_id,
        COUNT(popc.id)::int AS color_count,
        string_agg(popc.color_name, ', ') AS color_names
      FROM boms b
      JOIN purchase_order_product_colors popc
        ON popc.product_id = b.purchase_order_product_id
      WHERE b.bom_type = 'po'
      GROUP BY b.id, b.bom_code, b.purchase_order_product_id
      HAVING COUNT(popc.id) > 1;
    `);

    if (multiColorCollisions && multiColorCollisions.length > 0) {
      const details = multiColorCollisions
        .map(
          (c: any) =>
            `- PO BOM '${c.bom_code}' (${c.id}) on Product ${c.purchase_order_product_id} matches ${c.color_count} colors (${c.color_names})`,
        )
        .join('\n');
      throw new Error(
        `Cannot safely revert migration: The following PO BOMs belong to products with multiple colors, making unambiguous assignment to a single product_color_id impossible without data loss:\n${details}\nRollback aborted.`,
      );
    }

    const noColorProducts = await queryRunner.query(`
      SELECT
        b.id,
        b.bom_code,
        b.purchase_order_product_id
      FROM boms b
      LEFT JOIN purchase_order_product_colors popc
        ON popc.product_id = b.purchase_order_product_id
      WHERE b.bom_type = 'po'
        AND popc.id IS NULL;
    `);

    if (noColorProducts && noColorProducts.length > 0) {
      const details = noColorProducts
        .map(
          (c: any) =>
            `- PO BOM '${c.bom_code}' (${c.id}) on Product ${c.purchase_order_product_id}`,
        )
        .join('\n');
      throw new Error(
        `Cannot safely revert migration: The following PO BOMs have no corresponding colors in purchase_order_product_colors:\n${details}\nRollback aborted.`,
      );
    }

    // 2. Add product_color_id column
    await queryRunner.query(`
      ALTER TABLE boms
        ADD COLUMN product_color_id uuid;
    `);

    // 3. Add FK constraint to purchase_order_product_colors(id)
    await queryRunner.query(`
      ALTER TABLE boms
        ADD CONSTRAINT boms_product_color_id_fkey
        FOREIGN KEY (product_color_id)
        REFERENCES purchase_order_product_colors(id)
        ON DELETE RESTRICT;
    `);

    // 4. Backfill product_color_id from purchase_order_product_colors
    await queryRunner.query(`
      UPDATE boms b
      SET product_color_id = popc.id
      FROM purchase_order_product_colors popc
      WHERE b.purchase_order_product_id = popc.product_id
        AND b.bom_type = 'po';
    `);

    // 5. Drop new check constraint and partial unique index
    await queryRunner.query(`
      ALTER TABLE boms
        DROP CONSTRAINT IF EXISTS ck_bom_owner;

      DROP INDEX IF EXISTS uq_boms_po_product;

      ALTER TABLE boms
        DROP CONSTRAINT IF EXISTS fk_boms_purchase_order_product;

      ALTER TABLE boms
        DROP COLUMN IF EXISTS purchase_order_product_id;
    `);

    // 6. Restore original unique index on product_color_id
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_boms_po_product_color
        ON boms(product_color_id)
        WHERE bom_type = 'po' AND product_color_id IS NOT NULL;
    `);

    // 7. Restore original check constraint
    await queryRunner.query(`
      ALTER TABLE boms
        ADD CONSTRAINT ck_bom_owner CHECK (
          (
            bom_type = 'fit'
            AND style_id IS NOT NULL
            AND product_color_id IS NULL
          )
          OR
          (
            bom_type = 'po'
            AND style_id IS NULL
            AND product_color_id IS NOT NULL
          )
        );
    `);
  }
}
