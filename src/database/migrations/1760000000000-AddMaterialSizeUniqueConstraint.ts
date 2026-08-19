import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaterialSizeUniqueConstraint1760000000000 implements MigrationInterface {
  name = 'AddMaterialSizeUniqueConstraint1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE material_sizes
      ADD CONSTRAINT uq_material_sizes_material_id_size_code
      UNIQUE (material_id, size_code)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE material_sizes
      DROP CONSTRAINT uq_material_sizes_material_id_size_code
    `);
  }
}
