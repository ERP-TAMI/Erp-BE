import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterPoProductStructureImageVersionIdToVarchar1740000000017
  implements MigrationInterface
{
  name = 'AlterPoProductStructureImageVersionIdToVarchar1740000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "purchase_order_products" DROP CONSTRAINT IF EXISTS "purchase_order_products_structure_image_version_id_fkey";
      ALTER TABLE "purchase_order_products" ALTER COLUMN "structure_image_version_id" TYPE varchar(500) USING structure_image_version_id::varchar;

      UPDATE purchase_order_products pop
      SET structure_image_version_id = s.base_image_version_id
      FROM styles s
      WHERE pop.source_style_id = s.id
        AND pop.structure_image_version_id IS NULL
        AND s.base_image_version_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "purchase_order_products" ALTER COLUMN "structure_image_version_id" TYPE uuid USING structure_image_version_id::uuid;
    `);
  }
}
