import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBomRevisionsAndMigrateLines1740000000022 implements MigrationInterface {
  name = 'CreateBomRevisionsAndMigrateLines1740000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─────────────────────────────────────────────────────────────
    // 1. EXTENSIONS & TYPES
    // ─────────────────────────────────────────────────────────────
    // btree_gist extension is required for PostgreSQL EXCLUDE USING gist constraints
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS btree_gist;
    `);

    // revision_status enum for BOM revision governance workflow
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'revision_status') THEN
          CREATE TYPE revision_status AS ENUM (
            'draft',
            'in_review',
            'approved',
            'superseded',
            'cancelled'
          );
        END IF;
      END $$;
    `);

    // Add 'discontinued' value to record_status if not present (material master lifecycle)
    await queryRunner.query(`
      ALTER TYPE record_status ADD VALUE IF NOT EXISTS 'discontinued';
    `);

    // ─────────────────────────────────────────────────────────────
    // 2. CREATE TABLE fit_bom_revisions
    // ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fit_bom_revisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        style_id uuid NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
        revision_no integer NOT NULL CHECK (revision_no > 0),
        status revision_status NOT NULL DEFAULT 'draft',
        effective_from date,
        effective_to date,
        change_reason text,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
        approved_at timestamptz,
        row_version bigint NOT NULL DEFAULT 1,
        CONSTRAINT uq_fit_bom_revision UNIQUE (style_id, revision_no),
        CONSTRAINT ck_fit_bom_effective_range CHECK (
          effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from
        ),
        CONSTRAINT excl_fit_bom_no_overlap EXCLUDE USING gist (
          style_id WITH =,
          daterange(effective_from, effective_to, '[)') WITH &&
        ) WHERE (status = 'approved')
      );

      CREATE INDEX IF NOT EXISTS idx_fit_bom_revisions_style_status 
        ON fit_bom_revisions(style_id, status);
      CREATE INDEX IF NOT EXISTS idx_fit_bom_revisions_effective 
        ON fit_bom_revisions(style_id, effective_from, effective_to);
    `);

    // ─────────────────────────────────────────────────────────────
    // 3. CREATE TABLE bom_revisions (PO BOM)
    // ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bom_revisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bill_of_material_id uuid NOT NULL REFERENCES bills_of_materials(id) ON DELETE CASCADE,
        revision_no integer NOT NULL CHECK (revision_no > 0),
        status revision_status NOT NULL DEFAULT 'draft',
        source_fit_bom_revision_id uuid REFERENCES fit_bom_revisions(id) ON DELETE SET NULL,
        effective_from date,
        effective_to date,
        change_reason text,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
        approved_at timestamptz,
        row_version bigint NOT NULL DEFAULT 1,
        CONSTRAINT uq_bom_revision UNIQUE (bill_of_material_id, revision_no),
        CONSTRAINT ck_bom_effective_range CHECK (
          effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from
        ),
        CONSTRAINT excl_bom_no_overlap EXCLUDE USING gist (
          bill_of_material_id WITH =,
          daterange(effective_from, effective_to, '[)') WITH &&
        ) WHERE (status = 'approved')
      );

      CREATE INDEX IF NOT EXISTS idx_bom_revisions_bom_status 
        ON bom_revisions(bill_of_material_id, status);
      CREATE INDEX IF NOT EXISTS idx_bom_revisions_effective 
        ON bom_revisions(bill_of_material_id, effective_from, effective_to);
      CREATE INDEX IF NOT EXISTS idx_bom_revisions_source_fit 
        ON bom_revisions(source_fit_bom_revision_id);
    `);

    // ─────────────────────────────────────────────────────────────
    // 4. MIGRATE FIT BOM DATA (styles -> fit_bom_revisions -> fit_bom_lines)
    //    Legacy Baseline Rule:
    //      - revision_no = 1
    //      - effective_from = NULL, effective_to = NULL (unbounded: [NULL, NULL))
    //      - Không tự suy diễn created_at thành effective date
    // ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO fit_bom_revisions (
        id,
        style_id,
        revision_no,
        status,
        effective_from,
        effective_to,
        change_reason,
        created_at,
        approved_at
      )
      SELECT 
        gen_random_uuid(),
        s.id,
        1,
        'approved'::revision_status,
        NULL,
        NULL,
        'Dữ liệu khởi tạo ban đầu (Legacy baseline) - Chưa xác định mốc effective_from',
        s.created_at,
        s.created_at
      FROM styles s
      WHERE EXISTS (SELECT 1 FROM fit_bom_lines fbl WHERE fbl.style_id = s.id)
      ON CONFLICT (style_id, revision_no) DO NOTHING;
    `);

    // 4.1. Add column revision_id to fit_bom_lines
    await queryRunner.query(`
      ALTER TABLE fit_bom_lines ADD COLUMN IF NOT EXISTS revision_id uuid;
    `);

    // 4.2. Backfill revision_id from fit_bom_revisions
    await queryRunner.query(`
      UPDATE fit_bom_lines fbl
      SET revision_id = fbr.id
      FROM fit_bom_revisions fbr
      WHERE fbr.style_id = fbl.style_id AND fbr.revision_no = 1;
    `);

    // 4.3. Update constraints on fit_bom_lines
    await queryRunner.query(`
      ALTER TABLE fit_bom_lines DROP CONSTRAINT IF EXISTS uq_fit_bom_line_order;
      DROP INDEX IF EXISTS idx_fit_bom_lines_style_id;

      ALTER TABLE fit_bom_lines DROP COLUMN IF EXISTS style_id;
      ALTER TABLE fit_bom_lines ALTER COLUMN revision_id SET NOT NULL;

      ALTER TABLE fit_bom_lines 
        ADD CONSTRAINT fk_fit_bom_lines_revision 
        FOREIGN KEY (revision_id) REFERENCES fit_bom_revisions(id) ON DELETE CASCADE;

      ALTER TABLE fit_bom_lines 
        ADD CONSTRAINT uq_fit_bom_line_order 
        UNIQUE (revision_id, order_index);

      CREATE INDEX IF NOT EXISTS idx_fit_bom_lines_revision_id 
        ON fit_bom_lines(revision_id);
    `);

    // ─────────────────────────────────────────────────────────────
    // 5. MIGRATE PO BOM DATA (bills_of_materials -> bom_revisions -> bill_of_material_lines)
    //    Legacy Baseline Rule:
    //      - revision_no = 1
    //      - effective_from = NULL, effective_to = NULL (unbounded: [NULL, NULL))
    //      - Không tự suy diễn created_at thành effective date
    // ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO bom_revisions (
        id,
        bill_of_material_id,
        revision_no,
        status,
        effective_from,
        effective_to,
        change_reason,
        created_by,
        created_at,
        approved_by,
        approved_at
      )
      SELECT 
        gen_random_uuid(),
        bom.id,
        1,
        CASE WHEN bom.status = 'closed' THEN 'approved'::revision_status ELSE 'draft'::revision_status END,
        NULL,
        NULL,
        'Dữ liệu khởi tạo ban đầu (Legacy baseline) - Chưa xác định mốc effective_from',
        bom.created_by,
        bom.created_at,
        bom.approved_by,
        bom.approved_at
      FROM bills_of_materials bom
      ON CONFLICT (bill_of_material_id, revision_no) DO NOTHING;
    `);

    // 5.1. Add column revision_id to bill_of_material_lines
    await queryRunner.query(`
      ALTER TABLE bill_of_material_lines ADD COLUMN IF NOT EXISTS revision_id uuid;
    `);

    // 5.2. Backfill revision_id from bom_revisions
    await queryRunner.query(`
      UPDATE bill_of_material_lines bml
      SET revision_id = br.id
      FROM bom_revisions br
      WHERE br.bill_of_material_id = bml.bill_of_material_id AND br.revision_no = 1;
    `);

    // 5.3. Update constraints on bill_of_material_lines
    await queryRunner.query(`
      ALTER TABLE bill_of_material_lines DROP CONSTRAINT IF EXISTS uq_bom_line_order;
      ALTER TABLE bill_of_material_lines DROP CONSTRAINT IF EXISTS uq_bom_material;

      ALTER TABLE bill_of_material_lines DROP COLUMN IF EXISTS bill_of_material_id;
      ALTER TABLE bill_of_material_lines ALTER COLUMN revision_id SET NOT NULL;

      ALTER TABLE bill_of_material_lines 
        ADD CONSTRAINT fk_bom_lines_revision 
        FOREIGN KEY (revision_id) REFERENCES bom_revisions(id) ON DELETE CASCADE;

      ALTER TABLE bill_of_material_lines 
        ADD CONSTRAINT uq_bom_line_order 
        UNIQUE (revision_id, order_index);

      CREATE INDEX IF NOT EXISTS idx_bom_lines_revision_id 
        ON bill_of_material_lines(revision_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ─────────────────────────────────────────────────────────────
    // 1. REVERSE bill_of_material_lines: Restore bill_of_material_id
    // ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE bill_of_material_lines ADD COLUMN IF NOT EXISTS bill_of_material_id uuid;

      UPDATE bill_of_material_lines bml
      SET bill_of_material_id = br.bill_of_material_id
      FROM bom_revisions br
      WHERE br.id = bml.revision_id;

      ALTER TABLE bill_of_material_lines ALTER COLUMN bill_of_material_id SET NOT NULL;

      ALTER TABLE bill_of_material_lines DROP CONSTRAINT IF EXISTS fk_bom_lines_revision;
      ALTER TABLE bill_of_material_lines DROP CONSTRAINT IF EXISTS uq_bom_line_order;
      DROP INDEX IF EXISTS idx_bom_lines_revision_id;
      ALTER TABLE bill_of_material_lines DROP COLUMN IF EXISTS revision_id;

      ALTER TABLE bill_of_material_lines 
        ADD CONSTRAINT uq_bom_line_order 
        UNIQUE (bill_of_material_id, order_index);

      ALTER TABLE bill_of_material_lines 
        ADD CONSTRAINT fk_bom_lines_bom 
        FOREIGN KEY (bill_of_material_id) REFERENCES bills_of_materials(id) ON DELETE CASCADE;
    `);

    // ─────────────────────────────────────────────────────────────
    // 2. REVERSE fit_bom_lines: Restore style_id
    // ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE fit_bom_lines ADD COLUMN IF NOT EXISTS style_id uuid;

      UPDATE fit_bom_lines fbl
      SET style_id = fbr.style_id
      FROM fit_bom_revisions fbr
      WHERE fbr.id = fbl.revision_id;

      ALTER TABLE fit_bom_lines ALTER COLUMN style_id SET NOT NULL;

      ALTER TABLE fit_bom_lines DROP CONSTRAINT IF EXISTS fk_fit_bom_lines_revision;
      ALTER TABLE fit_bom_lines DROP CONSTRAINT IF EXISTS uq_fit_bom_line_order;
      DROP INDEX IF EXISTS idx_fit_bom_lines_revision_id;
      ALTER TABLE fit_bom_lines DROP COLUMN IF EXISTS revision_id;

      ALTER TABLE fit_bom_lines 
        ADD CONSTRAINT uq_fit_bom_line_order 
        UNIQUE (style_id, order_index);

      CREATE INDEX IF NOT EXISTS idx_fit_bom_lines_style_id 
        ON fit_bom_lines(style_id);
    `);

    // ─────────────────────────────────────────────────────────────
    // 3. DROP TABLES & ENUMS
    // ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DROP TABLE IF EXISTS bom_revisions CASCADE;
      DROP TABLE IF EXISTS fit_bom_revisions CASCADE;
      DROP TYPE IF EXISTS revision_status CASCADE;
    `);
  }
}
