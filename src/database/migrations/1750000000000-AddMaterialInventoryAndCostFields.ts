import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaterialInventoryAndCostFields1750000000000 implements MigrationInterface {
  name = 'AddMaterialInventoryAndCostFields1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE materials
        ADD COLUMN default_yield_pct numeric(8,4) NOT NULL DEFAULT 0,
        ADD COLUMN last_unit_cost numeric(18,2) NOT NULL DEFAULT 0,
        ADD COLUMN current_stock numeric(18,4) NOT NULL DEFAULT 0,
        ADD COLUMN low_stock_threshold numeric(18,4) NOT NULL DEFAULT 10,
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
        DROP CONSTRAINT ck_materials_low_stock_threshold_non_negative,
        DROP COLUMN default_yield_pct,
        DROP COLUMN last_unit_cost,
        DROP COLUMN current_stock,
        DROP COLUMN low_stock_threshold;
    `);
  }
}
