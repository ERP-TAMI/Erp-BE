import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductionDocSectionImageGroups1740000000015 implements MigrationInterface {
  name = 'AddProductionDocSectionImageGroups1740000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "production_document_sections"
      ADD COLUMN IF NOT EXISTS "image_groups" jsonb;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "production_document_sections"
      DROP COLUMN IF EXISTS "image_groups";
    `);
  }
}
