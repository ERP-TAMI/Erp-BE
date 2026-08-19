import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaterialGroupDisplayOrderAndNameUnique1740000000000 implements MigrationInterface {
  name = 'AddMaterialGroupDisplayOrderAndNameUnique1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM material_groups
          GROUP BY lower(btrim(name))
          HAVING count(*) > 1
        ) THEN
          RAISE EXCEPTION
            'Cannot add normalized material group name uniqueness: duplicate names exist';
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE material_groups
      ADD COLUMN display_order integer NOT NULL DEFAULT 0;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_material_groups_name_normalized
      ON material_groups (lower(btrim(name)));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX uq_material_groups_name_normalized;');
    await queryRunner.query(
      'ALTER TABLE material_groups DROP COLUMN display_order;',
    );
  }
}
