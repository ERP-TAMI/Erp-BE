import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSourceStyleDocumentToProductDocuments1740000000026 implements MigrationInterface {
  name = 'AddSourceStyleDocumentToProductDocuments1740000000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_order_product_documents
        ADD COLUMN IF NOT EXISTS source_style_document_id uuid
          REFERENCES documents(id) ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_order_product_documents
        DROP COLUMN IF EXISTS source_style_document_id;
    `);
  }
}
