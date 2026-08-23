import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveMaterialGroupDisplayOrder1740000000004
  implements MigrationInterface
{
  name = 'RemoveMaterialGroupDisplayOrder1740000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE material_groups
      DROP CONSTRAINT ck_material_groups_display_order_non_negative;
    `);
    await queryRunner.query(`
      ALTER TABLE material_groups
      DROP COLUMN display_order;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE material_groups
      ADD COLUMN display_order integer NOT NULL DEFAULT 0;
    `);
    await queryRunner.query(`
      ALTER TABLE material_groups
      ADD CONSTRAINT ck_material_groups_display_order_non_negative
      CHECK (display_order >= 0);
    `);
  }
}
