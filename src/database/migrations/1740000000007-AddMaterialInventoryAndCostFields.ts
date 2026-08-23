import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaterialInventoryAndCostFields1740000000007 implements MigrationInterface {
  name = 'AddMaterialInventoryAndCostFields1740000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM materials
          GROUP BY material_code
          HAVING count(*) > 1
        ) THEN
          RAISE EXCEPTION
            'Cannot update materials schema: duplicate material codes exist';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM materials material
          LEFT JOIN material_groups material_group
            ON material_group.id = material.material_group_id
          WHERE material.material_group_id IS NOT NULL
            AND material_group.id IS NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot update materials schema: orphan material group references exist';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM materials material
          LEFT JOIN units unit_record
            ON unit_record.id = material.default_unit_id
          WHERE material.default_unit_id IS NOT NULL
            AND unit_record.id IS NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot update materials schema: orphan default unit references exist';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM materials
          WHERE default_yield_pct IS NULL
             OR default_yield_pct < 0
             OR latest_unit_cost IS NULL
             OR latest_unit_cost < 0
             OR low_stock_threshold IS NULL
             OR low_stock_threshold < 0
        ) THEN
          RAISE EXCEPTION
            'Cannot update materials schema: null or negative inventory values exist';
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE materials
      ALTER COLUMN default_yield_pct TYPE numeric(8,4),
      ALTER COLUMN default_yield_pct SET DEFAULT 0,
      ALTER COLUMN default_yield_pct SET NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE materials
      RENAME COLUMN latest_unit_cost TO last_unit_cost;
    `);
    await queryRunner.query(`
      ALTER TABLE materials
      ALTER COLUMN last_unit_cost TYPE numeric(18,2),
      ALTER COLUMN last_unit_cost SET DEFAULT 0,
      ALTER COLUMN last_unit_cost SET NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE materials
      ADD COLUMN current_stock numeric(18,4) NOT NULL DEFAULT 0;
    `);
    await queryRunner.query(`
      ALTER TABLE materials
      ALTER COLUMN low_stock_threshold TYPE numeric(18,4),
      ALTER COLUMN low_stock_threshold SET DEFAULT 10,
      ALTER COLUMN low_stock_threshold SET NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE materials
      ADD CONSTRAINT ck_materials_default_yield_pct_non_negative
        CHECK (default_yield_pct >= 0),
      ADD CONSTRAINT ck_materials_last_unit_cost_non_negative
        CHECK (last_unit_cost >= 0),
      ADD CONSTRAINT ck_materials_current_stock_non_negative
        CHECK (current_stock >= 0),
      ADD CONSTRAINT ck_materials_low_stock_threshold_non_negative
        CHECK (low_stock_threshold >= 0);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE materials
      DROP CONSTRAINT ck_materials_default_yield_pct_non_negative,
      DROP CONSTRAINT ck_materials_last_unit_cost_non_negative,
      DROP CONSTRAINT ck_materials_current_stock_non_negative,
      DROP CONSTRAINT ck_materials_low_stock_threshold_non_negative;
    `);
    await queryRunner.query(`
      ALTER TABLE materials
      DROP COLUMN current_stock;
    `);
    await queryRunner.query(`
      ALTER TABLE materials
      RENAME COLUMN last_unit_cost TO latest_unit_cost;
    `);
    await queryRunner.query(`
      ALTER TABLE materials
      ALTER COLUMN default_yield_pct TYPE numeric(7,4);
    `);
  }
}
