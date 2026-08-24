import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFullProductionDocFields1740000000011 implements MigrationInterface {
  name = 'AddFullProductionDocFields1740000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "production_documents"
      ADD COLUMN IF NOT EXISTS "section1_description" text,
      ADD COLUMN IF NOT EXISTS "section1_image_url" text,
      ADD COLUMN IF NOT EXISTS "section2_accessories" text,
      ADD COLUMN IF NOT EXISTS "section3_notes" text,
      ADD COLUMN IF NOT EXISTS "section4_customer_feedback" text,
      ADD COLUMN IF NOT EXISTS "size_data" jsonb,
      ADD COLUMN IF NOT EXISTS "copied_from_style_id" uuid,
      ADD COLUMN IF NOT EXISTS "copied_at" timestamptz;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "production_documents"
      DROP COLUMN IF EXISTS "copied_at",
      DROP COLUMN IF EXISTS "copied_from_style_id",
      DROP COLUMN IF EXISTS "size_data",
      DROP COLUMN IF EXISTS "section4_customer_feedback",
      DROP COLUMN IF EXISTS "section3_notes",
      DROP COLUMN IF EXISTS "section2_accessories",
      DROP COLUMN IF EXISTS "section1_image_url",
      DROP COLUMN IF EXISTS "section1_description";
    `);
  }
}
