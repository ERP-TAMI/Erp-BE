import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaterialGroupDisplayOrderNonNegativeCheck1740000000001 implements MigrationInterface {
  name = 'AddMaterialGroupDisplayOrderNonNegativeCheck1740000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE material_groups
      ADD CONSTRAINT ck_material_groups_display_order_non_negative
      CHECK (display_order >= 0);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE material_groups DROP CONSTRAINT ck_material_groups_display_order_non_negative;',
    );
  }
}
