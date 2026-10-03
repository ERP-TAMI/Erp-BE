import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrantSaFullAccess1740000000050 implements MigrationInterface {
  name = 'GrantSaFullAccess1740000000050';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN purchase_order_mode SET DEFAULT 'FULL_ACCESS'
    `);
    await queryRunner.query(`
      UPDATE users AS u
      SET purchase_order_mode = 'FULL_ACCESS'
      WHERE EXISTS (
        SELECT 1
        FROM user_roles AS ur
        JOIN roles AS r ON r.id = ur.role_id
        WHERE ur.user_id = u.id AND r.code = 'SA'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN purchase_order_mode SET DEFAULT 'READ_ONLY'
    `);
    await queryRunner.query(`
      UPDATE users AS u
      SET purchase_order_mode = 'READ_ONLY'
      WHERE EXISTS (
        SELECT 1
        FROM user_roles AS ur
        JOIN roles AS r ON r.id = ur.role_id
        WHERE ur.user_id = u.id AND r.code = 'SA'
      )
    `);
  }
}
