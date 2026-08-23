import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveMaterialGroupCode1740000000005
  implements MigrationInterface
{
  name = 'RemoveMaterialGroupCode1740000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE material_groups
      DROP CONSTRAINT material_groups_code_key;
    `);
    await queryRunner.query(`
      ALTER TABLE material_groups
      DROP COLUMN code;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE material_groups
      ADD COLUMN code varchar(50);
    `);
    await queryRunner.query(`
      UPDATE material_groups
      SET code = 'MG-' || upper(replace(id::text, '-', ''))
      WHERE code IS NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE material_groups
      ALTER COLUMN code SET NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE material_groups
      ADD CONSTRAINT material_groups_code_key UNIQUE (code);
    `);
  }
}
