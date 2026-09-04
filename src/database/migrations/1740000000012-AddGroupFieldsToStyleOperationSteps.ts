import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGroupFieldsToStyleOperationSteps1740000000012 implements MigrationInterface {
  name = 'AddGroupFieldsToStyleOperationSteps1740000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE style_operation_steps
        ADD COLUMN IF NOT EXISTS group_id uuid,
        ADD COLUMN IF NOT EXISTS group_items jsonb;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE style_operation_steps
        DROP COLUMN IF EXISTS group_id,
        DROP COLUMN IF EXISTS group_items;
    `);
  }
}
