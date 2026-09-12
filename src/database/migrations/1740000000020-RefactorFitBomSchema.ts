import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorFitBomSchema1740000000020 implements MigrationInterface {
  name = 'RefactorFitBomSchema1740000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create table fit_bom_lines pointing directly to styles(id)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fit_bom_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        style_id uuid NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
        material_id uuid REFERENCES materials(id) ON DELETE RESTRICT,
        material_name_snapshot varchar(255) NOT NULL,
        material_group_snapshot varchar(100),
        unit_snapshot varchar(50),
        material_group_id uuid REFERENCES material_groups(id) ON DELETE RESTRICT,
        unit_id uuid REFERENCES units(id) ON DELETE RESTRICT,
        consumption numeric(18,6) NOT NULL CHECK (consumption >= 0),
        note text,
        order_index integer NOT NULL CHECK (order_index >= 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_fit_bom_line_order UNIQUE (style_id, order_index)
      );
      CREATE INDEX IF NOT EXISTS idx_fit_bom_lines_style_id ON fit_bom_lines(style_id);
    `);

    // 2. Migrate existing data from draft_bom_lines if tables exist
    const hasDraftTables = await queryRunner.hasTable('draft_bom_lines');
    if (hasDraftTables) {
      await queryRunner.query(`
        INSERT INTO fit_bom_lines (
          id, style_id, material_id, material_name_snapshot, material_group_snapshot, unit_snapshot,
          material_group_id, unit_id, consumption, note, order_index, created_at, updated_at
        )
        SELECT
          dbl.id,
          dbf.style_id,
          dbl.material_id,
          dbl.material_name_snapshot,
          mg.name AS material_group_snapshot,
          COALESCE(u.name, 'Mét') AS unit_snapshot,
          COALESCE(dbl.material_group_id, m.material_group_id) AS material_group_id,
          COALESCE(dbl.unit_id, m.default_unit_id) AS unit_id,
          dbl.consumption,
          dbl.note,
          dbl.order_index,
          COALESCE(dbf.created_at, now()),
          now()
        FROM draft_bom_lines dbl
        JOIN draft_bom_versions dbv ON dbv.id = dbl.version_id
        JOIN draft_bom_families dbf ON dbf.id = dbv.family_id
        LEFT JOIN materials m ON m.id = dbl.material_id
        LEFT JOIN material_groups mg ON mg.id = COALESCE(dbl.material_group_id, m.material_group_id)
        LEFT JOIN units u ON u.id = COALESCE(dbl.unit_id, m.default_unit_id)
        ON CONFLICT (id) DO NOTHING;
      `);
    }

    // 3. Drop obsolete tables
    await queryRunner.query(`
      DROP TABLE IF EXISTS draft_bom_lines CASCADE;
      DROP TABLE IF EXISTS draft_bom_versions CASCADE;
      DROP TABLE IF EXISTS draft_bom_families CASCADE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS draft_bom_families (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        style_id uuid NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
        bom_code varchar(100) NOT NULL UNIQUE,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS draft_bom_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        family_id uuid NOT NULL REFERENCES draft_bom_families(id) ON DELETE CASCADE,
        parent_version_id uuid REFERENCES draft_bom_versions(id) ON DELETE RESTRICT,
        version_no integer NOT NULL CHECK (version_no > 0),
        change_reason text,
        is_current boolean NOT NULL DEFAULT false,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_draft_bom_version UNIQUE (family_id, version_no)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_draft_bom_one_current ON draft_bom_versions(family_id) WHERE is_current;

      CREATE TABLE IF NOT EXISTS draft_bom_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        version_id uuid NOT NULL REFERENCES draft_bom_versions(id) ON DELETE CASCADE,
        material_id uuid REFERENCES materials(id) ON DELETE RESTRICT,
        material_name_snapshot varchar(255) NOT NULL,
        material_group_id uuid REFERENCES material_groups(id) ON DELETE RESTRICT,
        unit_id uuid REFERENCES units(id) ON DELETE RESTRICT,
        consumption numeric(18,6) NOT NULL CHECK (consumption >= 0),
        note text,
        order_index integer NOT NULL CHECK (order_index >= 0),
        CONSTRAINT uq_draft_bom_line_order UNIQUE (version_id, order_index)
      );

      DROP TABLE IF EXISTS fit_bom_lines CASCADE;
    `);
  }
}
