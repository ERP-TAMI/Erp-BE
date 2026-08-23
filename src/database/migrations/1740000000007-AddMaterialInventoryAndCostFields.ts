import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMaterialInventoryAndCostFields1740000000007 implements MigrationInterface {
  name = 'AddMaterialInventoryAndCostFields1740000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE materials
      ALTER COLUMN default_yield_pct TYPE numeric(8,4);
    `);
    await queryRunner.query(`
      ALTER TABLE materials
      RENAME COLUMN latest_unit_cost TO last_unit_cost;
    `);
    await queryRunner.query(`
      ALTER TABLE materials
      ADD COLUMN current_stock numeric(18,4) NOT NULL DEFAULT 0,
      ADD CONSTRAINT ck_materials_current_stock_non_negative
        CHECK (current_stock >= 0);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM materials
          WHERE default_yield_pct > 999.9999
        ) THEN
          RAISE EXCEPTION
            'Cannot revert materials schema: default_yield_pct exceeds numeric(7,4)';
        END IF;
      END $$;
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
