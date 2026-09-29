import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductionDocCopiedFromStyleForeignKey1740000000038 implements MigrationInterface {
  name = 'AddProductionDocCopiedFromStyleForeignKey1740000000038';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Clear any dangling reference (source style already deleted before this
    // constraint existed) so the backfill doesn't fail.
    await queryRunner.query(`
      UPDATE production_documents pd
      SET copied_from_style_id = NULL
      WHERE pd.copied_from_style_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM styles s WHERE s.id = pd.copied_from_style_id
        );
    `);

    await queryRunner.query(`
      ALTER TABLE production_documents
        ADD CONSTRAINT production_documents_copied_from_style_id_fkey
        FOREIGN KEY (copied_from_style_id) REFERENCES styles(id) ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE production_documents
        DROP CONSTRAINT IF EXISTS production_documents_copied_from_style_id_fkey;
    `);
  }
}
