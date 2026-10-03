import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDocumentPins1740000000048 implements MigrationInterface {
  name = 'RemoveDocumentPins1740000000048';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS document_pins`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE document_pins (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        pinned_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_document_pins PRIMARY KEY (user_id, document_id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_document_pins_document_id ON document_pins(document_id)`,
    );
  }
}
