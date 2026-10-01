import { MigrationInterface, QueryRunner } from 'typeorm';

const TRIGRAM_INDEXES: Array<[string, string, string]> = [
  ['ix_boms_bom_code_trgm', 'boms', 'bom_code'],
  ['ix_styles_style_code_trgm', 'styles', 'style_code'],
  ['ix_styles_style_name_trgm', 'styles', 'style_name'],
  ['ix_po_po_code_trgm', 'purchase_orders', 'po_code'],
  ['ix_po_products_code_trgm', 'purchase_order_products', 'product_code'],
  ['ix_po_products_name_trgm', 'purchase_order_products', 'product_name'],
  ['ix_po_colors_name_trgm', 'purchase_order_product_colors', 'color_name'],
  ['ix_bom_lines_material_name_trgm', 'bom_lines', 'material_name_snapshot'],
];

/** Index cho tìm kiếm ILIKE '%x%' và sắp xếp mặc định của danh sách BOM. */
export class AddBomListSearchIndexes1740000000044 implements MigrationInterface {
  name = 'AddBomListSearchIndexes1740000000044';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    for (const [index, table, column] of TRIGRAM_INDEXES) {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS ${index} ON ${table} USING gin (${column} gin_trgm_ops);`,
      );
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_boms_current_revision ON boms (current_revision_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS ix_boms_created ON boms (created_at DESC, id DESC);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ix_boms_created;`);
    await queryRunner.query(`DROP INDEX IF EXISTS ix_boms_current_revision;`);
    for (const [index] of TRIGRAM_INDEXES) {
      await queryRunner.query(`DROP INDEX IF EXISTS ${index};`);
    }
  }
}
