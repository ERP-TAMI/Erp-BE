import { MigrationInterface, QueryRunner } from 'typeorm';

export class DocumentLibrarySearchAndSingleFolder1740000000049 implements MigrationInterface {
  name = 'DocumentLibrarySearchAndSingleFolder1740000000049';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // Preserve the canonical location already returned by the library API.
    await queryRunner.query(`
      DELETE FROM folder_documents newer
      USING folder_documents older
      WHERE newer.document_id = older.document_id
        AND (newer.linked_at, newer.folder_id) > (older.linked_at, older.folder_id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_folder_documents_document_id
      ON folder_documents(document_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_documents_title_trgm
      ON documents USING gin (title gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_document_versions_file_name_trgm
      ON document_versions USING gin (original_file_name gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_document_folders_name_trgm
      ON document_folders USING gin (folder_name gin_trgm_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS ix_document_folders_name_trgm`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS ix_document_versions_file_name_trgm`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS ix_documents_title_trgm`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_folder_documents_document_id`,
    );
  }
}
