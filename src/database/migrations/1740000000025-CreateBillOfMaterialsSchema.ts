import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBillOfMaterialsSchema1740000000025 implements MigrationInterface {
  name = 'CreateBillOfMaterialsSchema1740000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create Enums if they do not already exist
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bom_type') THEN
          CREATE TYPE bom_type AS ENUM ('fit', 'po');
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bom_revision_status') THEN
          CREATE TYPE bom_revision_status AS ENUM (
            'wait_nvkh',
            'wait_rd',
            'wait_tpkh_confirm',
            'wait_accounting',
            'wait_sa_approve',
            'closed'
          );
        END IF;
      END $$;
    `);

    // 2. Safely drop legacy placeholder BOM tables if existing
    await queryRunner.query(`
      DROP TABLE IF EXISTS bill_of_material_status_history CASCADE;
      DROP TABLE IF EXISTS bill_of_material_lines CASCADE;
      DROP TABLE IF EXISTS bills_of_materials CASCADE;
    `);

    // 3. Create boms table (Header)
    await queryRunner.query(`
      CREATE TABLE boms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bom_code varchar(100) NOT NULL UNIQUE,
        bom_type bom_type NOT NULL,
        style_id uuid REFERENCES styles(id) ON DELETE RESTRICT,
        product_color_id uuid REFERENCES purchase_order_product_colors(id) ON DELETE RESTRICT,
        current_revision_id uuid,
        product_code_snapshot varchar(100) NOT NULL,
        product_name_snapshot varchar(255) NOT NULL,
        color_name_snapshot varchar(100),
        po_code_snapshot varchar(50),
        order_quantity_snapshot integer CHECK (order_quantity_snapshot > 0),
        deadline timestamptz,
        rd_note text,
        discontinued_at timestamptz,
        discontinued_by uuid REFERENCES users(id) ON DELETE SET NULL,
        discontinued_reason text,
        row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_bom_discontinued CHECK (
          (
            discontinued_at IS NULL
            AND discontinued_by IS NULL
            AND discontinued_reason IS NULL
          )
          OR
          (
            discontinued_at IS NOT NULL
            AND discontinued_reason IS NOT NULL
          )
        ),
        CONSTRAINT ck_bom_owner CHECK (
          (
            bom_type = 'fit'
            AND style_id IS NOT NULL
            AND product_color_id IS NULL
          )
          OR
          (
            bom_type = 'po'
            AND style_id IS NULL
            AND product_color_id IS NOT NULL
          )
        )
      );

      CREATE UNIQUE INDEX uq_boms_fit_style
        ON boms(style_id)
        WHERE bom_type = 'fit' AND style_id IS NOT NULL;

      CREATE UNIQUE INDEX uq_boms_po_product_color
        ON boms(product_color_id)
        WHERE bom_type = 'po' AND product_color_id IS NOT NULL;

      CREATE INDEX ix_boms_type_created
        ON boms (bom_type, created_at DESC, id DESC);
    `);

    // 4. Create bom_revisions table
    await queryRunner.query(`
      CREATE TABLE bom_revisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bom_id uuid NOT NULL REFERENCES boms(id) ON DELETE CASCADE,
        revision_no integer NOT NULL CHECK (revision_no > 0),
        status bom_revision_status NOT NULL DEFAULT 'wait_nvkh',
        source_revision_id uuid REFERENCES bom_revisions(id) ON DELETE SET NULL,
        change_reason text,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
        approved_at timestamptz,
        row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
        CONSTRAINT uq_bom_revision UNIQUE (bom_id, revision_no),
        CONSTRAINT ck_source_revision_not_self CHECK (
          source_revision_id IS NULL OR source_revision_id <> id
        ),
        CONSTRAINT ck_bom_revision_approval CHECK (
          (
            status = 'closed'
            AND approved_by IS NOT NULL
            AND approved_at IS NOT NULL
          )
          OR
          (
            status <> 'closed'
            AND approved_by IS NULL
            AND approved_at IS NULL
          )
        ),
        CONSTRAINT uq_bom_revision_id_bom UNIQUE (id, bom_id)
      );

      CREATE INDEX ix_bom_revisions_bom
        ON bom_revisions (bom_id, revision_no DESC);

      CREATE INDEX ix_bom_revisions_status
        ON bom_revisions (bom_id, status);
    `);

    // 5. Add Composite Foreign Key from boms to bom_revisions
    await queryRunner.query(`
      ALTER TABLE boms
        ADD CONSTRAINT fk_boms_current_revision
        FOREIGN KEY (current_revision_id, id)
        REFERENCES bom_revisions (id, bom_id)
        ON DELETE RESTRICT;
    `);

    // 6. Create bom_lines table
    await queryRunner.query(`
      CREATE TABLE bom_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        revision_id uuid NOT NULL REFERENCES bom_revisions(id) ON DELETE CASCADE,
        material_id uuid,
        material_name_snapshot varchar(255) NOT NULL,
        material_group_snapshot varchar(100),
        unit_snapshot varchar(50) NOT NULL,
        material_group_id uuid,
        unit_id uuid,
        consumption numeric(18,6) NOT NULL CHECK (consumption >= 0),
        unit_cost numeric(18,2) CHECK (unit_cost >= 0),
        note text,
        order_index integer NOT NULL CHECK (order_index >= 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_bom_line_order UNIQUE (revision_id, order_index)
      );

      CREATE UNIQUE INDEX uq_bom_line_material
        ON bom_lines (revision_id, material_id)
        WHERE material_id IS NOT NULL;

      CREATE INDEX ix_bom_lines_revision
        ON bom_lines (revision_id, order_index);
    `);

    // 7. Create bom_revision_status_history table
    await queryRunner.query(`
      CREATE TABLE bom_revision_status_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        revision_id uuid NOT NULL REFERENCES bom_revisions(id) ON DELETE CASCADE,
        old_status bom_revision_status,
        new_status bom_revision_status NOT NULL,
        action varchar(50) NOT NULL,
        reason text,
        changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
        changed_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_status_history_reject_reason CHECK (
          action <> 'reject' OR reason IS NOT NULL
        )
      );

      CREATE INDEX ix_bom_revision_status_history
        ON bom_revision_status_history (revision_id, changed_at DESC, id DESC);
    `);

    // 8. Triggers for updated_at
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_boms_updated_at ON boms;
      CREATE TRIGGER trg_boms_updated_at
        BEFORE UPDATE ON boms
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at_timestamp();

      DROP TRIGGER IF EXISTS trg_bom_lines_updated_at ON bom_lines;
      CREATE TRIGGER trg_bom_lines_updated_at
        BEFORE UPDATE ON bom_lines
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at_timestamp();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_bom_lines_updated_at ON bom_lines;
      DROP TRIGGER IF EXISTS trg_boms_updated_at ON boms;
      DROP TABLE IF EXISTS bom_revision_status_history CASCADE;
      DROP TABLE IF EXISTS bom_lines CASCADE;
      ALTER TABLE IF EXISTS boms DROP CONSTRAINT IF EXISTS fk_boms_current_revision;
      DROP TABLE IF EXISTS bom_revisions CASCADE;
      DROP TABLE IF EXISTS boms CASCADE;
      DROP TYPE IF EXISTS bom_revision_status;
      DROP TYPE IF EXISTS bom_type;
    `);
  }
}
