import { MigrationInterface, QueryRunner } from 'typeorm';

export class SimplifyMaterialsAndUnitsFields1740000000008 implements MigrationInterface {
  name = 'SimplifyMaterialsAndUnitsFields1740000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE materials
        DROP CONSTRAINT ck_materials_current_stock_non_negative,
        DROP CONSTRAINT materials_low_stock_threshold_check,
        DROP CONSTRAINT materials_latest_unit_cost_check,
        DROP COLUMN current_stock,
        DROP COLUMN low_stock_threshold,
        DROP COLUMN last_unit_cost;
    `);
    // The plain UNIQUE on material_code (from the base schema) is case-sensitive,
    // while the service enforces uniqueness case-insensitively. Replace it outright
    // with a case-insensitive index instead of keeping both — the normalized index
    // is a strict superset (anything it allows through, the plain one would too).
    await queryRunner.query(`
      ALTER TABLE materials DROP CONSTRAINT materials_material_code_key;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_materials_code_normalized ON materials (UPPER(BTRIM(material_code)));
    `);
    // Units are identified by name alone now (id is the real identifier) —
    // the short "code" field the base schema added is no longer used anywhere.
    await queryRunner.query(`
      ALTER TABLE units
        DROP CONSTRAINT units_code_key,
        DROP COLUMN code;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE units
        ADD COLUMN code varchar(30);
    `);
    // code cannot be reconstructed once dropped; fill a short placeholder (truncated
    // to fit varchar(30) — a bare UUID alone is already 36 characters) so the column
    // can be made NOT NULL/UNIQUE again, and rely on manual re-entry afterwards.
    await queryRunner.query(`
      UPDATE units SET code = LEFT('RV-' || id::text, 30);
    `);
    await queryRunner.query(`
      ALTER TABLE units
        ALTER COLUMN code SET NOT NULL,
        ADD CONSTRAINT units_code_key UNIQUE (code);
    `);
    await queryRunner.query(`
      DROP INDEX uq_materials_code_normalized;
    `);
    await queryRunner.query(`
      ALTER TABLE materials
        ADD CONSTRAINT materials_material_code_key UNIQUE (material_code);
    `);
    await queryRunner.query(`
      ALTER TABLE materials
        ADD COLUMN current_stock numeric(18,4) NOT NULL DEFAULT 0,
        ADD COLUMN low_stock_threshold numeric(18,4) NOT NULL DEFAULT 10,
        ADD COLUMN last_unit_cost numeric(18,2) NOT NULL DEFAULT 0;
    `);
    await queryRunner.query(`
      ALTER TABLE materials
        ADD CONSTRAINT ck_materials_current_stock_non_negative CHECK (current_stock >= 0),
        ADD CONSTRAINT materials_low_stock_threshold_check CHECK (low_stock_threshold >= 0),
        ADD CONSTRAINT materials_latest_unit_cost_check CHECK (last_unit_cost >= 0);
    `);
  }
}
