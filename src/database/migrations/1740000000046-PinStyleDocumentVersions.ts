import { MigrationInterface, QueryRunner } from 'typeorm';

export class PinStyleDocumentVersions1740000000046 implements MigrationInterface {
  name = 'PinStyleDocumentVersions1740000000046';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE style_documents
       ADD COLUMN document_version_id uuid`,
    );
    await queryRunner.query(`
      UPDATE style_documents sd
      SET document_version_id = d.current_version_id
      FROM documents d
      WHERE d.id = sd.document_id
        AND d.current_version_id IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE style_documents
      ADD CONSTRAINT fk_style_documents_version
      FOREIGN KEY (document_version_id)
      REFERENCES document_versions(id)
      ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX idx_style_documents_version
      ON style_documents(document_version_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_style_documents_version`);
    await queryRunner.query(`
      ALTER TABLE style_documents
      DROP CONSTRAINT IF EXISTS fk_style_documents_version
    `);
    await queryRunner.query(
      `ALTER TABLE style_documents DROP COLUMN IF EXISTS document_version_id`,
    );
  }
}
