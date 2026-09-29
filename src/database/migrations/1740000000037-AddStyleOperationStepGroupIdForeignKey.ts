import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStyleOperationStepGroupIdForeignKey1740000000037 implements MigrationInterface {
  name = 'AddStyleOperationStepGroupIdForeignKey1740000000037';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Orphan group_id (pointing at a stage_groups row that no longer exists)
    // would otherwise make the FK backfill fail — clear those first, matching
    // the ON DELETE SET NULL behavior the new constraint enforces going forward.
    await queryRunner.query(`
      UPDATE style_operation_steps s
      SET group_id = NULL
      WHERE s.group_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM stage_groups g WHERE g.id = s.group_id
        );
    `);

    await queryRunner.query(`
      ALTER TABLE style_operation_steps
        ADD CONSTRAINT style_operation_steps_group_id_fkey
        FOREIGN KEY (group_id) REFERENCES stage_groups(id) ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE style_operation_steps
        DROP CONSTRAINT IF EXISTS style_operation_steps_group_id_fkey;
    `);
  }
}
