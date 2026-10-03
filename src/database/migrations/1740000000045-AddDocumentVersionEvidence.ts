import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentVersionEvidence1740000000045 implements MigrationInterface {
  name = 'AddDocumentVersionEvidence1740000000045';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS evidence_storage_key varchar(1000)`,
    );
    await queryRunner.query(
      `ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS evidence_file_name varchar(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS evidence_mime_type varchar(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE document_versions DROP COLUMN IF EXISTS evidence_mime_type`,
    );
    await queryRunner.query(
      `ALTER TABLE document_versions DROP COLUMN IF EXISTS evidence_file_name`,
    );
    await queryRunner.query(
      `ALTER TABLE document_versions DROP COLUMN IF EXISTS evidence_storage_key`,
    );
  }
}
