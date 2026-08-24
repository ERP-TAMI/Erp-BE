import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterStyleBaseImageVersionIdToVarchar1740000000012
  implements MigrationInterface
{
  name = 'AlterStyleBaseImageVersionIdToVarchar1740000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "styles" DROP CONSTRAINT IF EXISTS "styles_base_image_version_id_fkey";
      ALTER TABLE "styles" ALTER COLUMN "base_image_version_id" TYPE varchar(500) USING base_image_version_id::varchar;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "styles" ALTER COLUMN "base_image_version_id" TYPE uuid USING base_image_version_id::uuid;
    `);
  }
}
