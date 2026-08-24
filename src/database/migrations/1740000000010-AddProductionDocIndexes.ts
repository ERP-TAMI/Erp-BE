import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductionDocIndexes1740000000010 implements MigrationInterface {
  name = 'AddProductionDocIndexes1740000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_prod_doc_size_rows_order 
      ON production_document_size_rows (production_document_id, order_index);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS ix_prod_doc_size_rows_order;`,
    );
  }
}
