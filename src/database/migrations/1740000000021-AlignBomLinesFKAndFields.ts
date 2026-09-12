import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignBomLinesFKAndFields1740000000021 implements MigrationInterface {
  name = 'AlignBomLinesFKAndFields1740000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ──────────────────────────────────────────────
    // 1. fit_bom_lines — drop FK constraints
    //    Snapshot pattern: snapshots are IMMUTABLE after approval.
    //    IDs are kept nullable for query/reporting only
    //    (e.g. "find all BOMs using material X"), NOT for
    //    updating snapshots from master data.
    // ──────────────────────────────────────────────
    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN (
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'fit_bom_lines'::regclass
            AND contype = 'f'
        )
        LOOP
          EXECUTE format('ALTER TABLE fit_bom_lines DROP CONSTRAINT %I', r.conname);
        END LOOP;
      END
      $$;
    `);

    // 2. fit_bom_lines — add waste_percent (from DBML, was missing in entity)
    await queryRunner.query(`
      ALTER TABLE fit_bom_lines
        ADD COLUMN IF NOT EXISTS waste_percent numeric(5,2) NOT NULL DEFAULT 0;
    `);

    // ──────────────────────────────────────────────
    // 3. bill_of_material_lines — make material_id nullable + drop FK
    //    Snapshot pattern: snapshots are IMMUTABLE after approval.
    //    Material master uses soft-delete (active/inactive/discontinued),
    //    not physical delete. IDs kept for query/reporting.
    // ──────────────────────────────────────────────
    await queryRunner.query(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN (
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'bill_of_material_lines'::regclass
            AND contype = 'f'
        )
        LOOP
          EXECUTE format('ALTER TABLE bill_of_material_lines DROP CONSTRAINT %I', r.conname);
        END LOOP;
      END
      $$;
    `);

    await queryRunner.query(`
      ALTER TABLE bill_of_material_lines
        ALTER COLUMN material_id DROP NOT NULL;
    `);

    // 4. bill_of_material_lines — add reference ID columns (nullable, no FK)
    //    For query/reporting only (e.g. filter BOMs by material group).
    //    Snapshots remain the source of truth for display/history.
    await queryRunner.query(`
      ALTER TABLE bill_of_material_lines
        ADD COLUMN IF NOT EXISTS material_group_id uuid,
        ADD COLUMN IF NOT EXISTS unit_id uuid;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse: drop added columns
    await queryRunner.query(`
      ALTER TABLE bill_of_material_lines
        DROP COLUMN IF EXISTS unit_id,
        DROP COLUMN IF EXISTS material_group_id;
    `);

    // Reverse: make material_id NOT NULL again
    await queryRunner.query(`
      ALTER TABLE bill_of_material_lines
        ALTER COLUMN material_id SET NOT NULL;
    `);

    // Reverse: drop waste_percent
    await queryRunner.query(`
      ALTER TABLE fit_bom_lines
        DROP COLUMN IF EXISTS waste_percent;
    `);

    // Re-add FK constraints on fit_bom_lines
    await queryRunner.query(`
      ALTER TABLE fit_bom_lines
        ADD CONSTRAINT fit_bom_lines_material_id_fkey
          FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT,
        ADD CONSTRAINT fit_bom_lines_material_group_id_fkey
          FOREIGN KEY (material_group_id) REFERENCES material_groups(id) ON DELETE RESTRICT,
        ADD CONSTRAINT fit_bom_lines_unit_id_fkey
          FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT;
    `);

    // Re-add FK constraints on bill_of_material_lines (only material_id existed before)
    // Note: We don't re-add material_group_id/unit_id FKs since those columns didn't exist before
  }
}
