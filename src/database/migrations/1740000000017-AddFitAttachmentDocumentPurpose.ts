import { MigrationInterface, QueryRunner } from 'typeorm';

const PURPOSE_COLUMN_TABLES = [
  'style_documents',
  'purchase_order_documents',
  'purchase_order_product_documents',
];

export class AddFitAttachmentDocumentPurpose1740000000017 implements MigrationInterface {
  name = 'AddFitAttachmentDocumentPurpose1740000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE document_purpose ADD VALUE IF NOT EXISTS 'fit_attachment';`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of PURPOSE_COLUMN_TABLES) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM ${table} WHERE purpose = 'fit_attachment') THEN
            RAISE EXCEPTION
              'Cannot drop document_purpose value "fit_attachment": rows in ${table} still use it';
          END IF;
        END $$;
      `);
    }

    await queryRunner.query(
      `ALTER TYPE document_purpose RENAME TO document_purpose_old;`,
    );
    await queryRunner.query(`
      CREATE TYPE document_purpose AS ENUM (
        'po_original', 'tech_pack', 'material_pdf', 'sample_image',
        'translation', 'color_card', 'production_doc', 'avatar', 'other'
      );
    `);

    for (const table of PURPOSE_COLUMN_TABLES) {
      await queryRunner.query(
        `ALTER TABLE ${table} ALTER COLUMN purpose DROP DEFAULT;`,
      );
      await queryRunner.query(`
        ALTER TABLE ${table}
        ALTER COLUMN purpose TYPE document_purpose USING purpose::text::document_purpose;
      `);
      await queryRunner.query(
        `ALTER TABLE ${table} ALTER COLUMN purpose SET DEFAULT 'other';`,
      );
    }

    await queryRunner.query(`DROP TYPE document_purpose_old;`);
  }
}
