import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeRevisionNoNullableAndAddPartialUniqueIndex1740000000023 implements MigrationInterface {
  name = 'MakeRevisionNoNullableAndAddPartialUniqueIndex1740000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. fit_bom_revisions:
    // - Make revision_no nullable (draft / in_review / cancelled revisions do NOT have a business version number)
    // - Preserve CHECK (revision_no > 0) when revision_no is not null (in PostgreSQL, CHECK (val > 0) naturally allows NULL)
    // - Replace full unique constraint with partial unique index: UNIQUE(style_id, revision_no) WHERE revision_no IS NOT NULL
    await queryRunner.query(`
      ALTER TABLE fit_bom_revisions ALTER COLUMN revision_no DROP NOT NULL;
      ALTER TABLE fit_bom_revisions DROP CONSTRAINT IF EXISTS uq_fit_bom_revision;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_fit_bom_revision 
        ON fit_bom_revisions (style_id, revision_no) 
        WHERE revision_no IS NOT NULL;
    `);

    // 2. bom_revisions:
    // - Make revision_no nullable (draft / in_review / cancelled revisions do NOT have a business version number)
    // - Preserve CHECK (revision_no > 0) when revision_no is not null
    // - Replace full unique constraint with partial unique index: UNIQUE(bill_of_material_id, revision_no) WHERE revision_no IS NOT NULL
    await queryRunner.query(`
      ALTER TABLE bom_revisions ALTER COLUMN revision_no DROP NOT NULL;
      ALTER TABLE bom_revisions DROP CONSTRAINT IF EXISTS uq_bom_revision;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_bom_revision 
        ON bom_revisions (bill_of_material_id, revision_no) 
        WHERE revision_no IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Rollback safety preflight check:
    // If any revision in fit_bom_revisions or bom_revisions has revision_no IS NULL
    // (e.g. draft, in_review, cancelled revisions), we cannot restore NOT NULL without
    // either dropping data or inventing fake business version numbers.
    // Explicitly raise an exception to abort rollback.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM fit_bom_revisions WHERE revision_no IS NULL
        ) OR EXISTS (
          SELECT 1 FROM bom_revisions WHERE revision_no IS NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot revert migration 1740000000023: draft/in_review/cancelled revisions without a business revision number (revision_no IS NULL) still exist in fit_bom_revisions or bom_revisions. Rollback aborted.';
        END IF;
      END $$;
    `);

    // 2. Revert bom_revisions:
    // - Drop partial unique index
    // - Restore NOT NULL on revision_no
    // - Restore original unique constraint: UNIQUE (bill_of_material_id, revision_no)
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_bom_revision;
      ALTER TABLE bom_revisions ALTER COLUMN revision_no SET NOT NULL;
      ALTER TABLE bom_revisions ADD CONSTRAINT uq_bom_revision UNIQUE (bill_of_material_id, revision_no);
    `);

    // 3. Revert fit_bom_revisions:
    // - Drop partial unique index
    // - Restore NOT NULL on revision_no
    // - Restore original unique constraint: UNIQUE (style_id, revision_no)
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_fit_bom_revision;
      ALTER TABLE fit_bom_revisions ALTER COLUMN revision_no SET NOT NULL;
      ALTER TABLE fit_bom_revisions ADD CONSTRAINT uq_fit_bom_revision UNIQUE (style_id, revision_no);
    `);
  }
}
