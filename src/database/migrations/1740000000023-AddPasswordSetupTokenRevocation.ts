import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordSetupTokenRevocation1740000000023 implements MigrationInterface {
  name = 'AddPasswordSetupTokenRevocation1740000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_password_setup_tokens
        ADD COLUMN revoked_at timestamptz
    `);
    await queryRunner.query(`DROP INDEX uq_user_password_setup_tokens_active`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_user_password_setup_tokens_active
      ON user_password_setup_tokens (user_id)
      WHERE used_at IS NULL AND revoked_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX uq_user_password_setup_tokens_active`);
    await queryRunner.query(`
      UPDATE user_password_setup_tokens
      SET used_at = COALESCE(used_at, revoked_at)
      WHERE revoked_at IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE user_password_setup_tokens
        DROP COLUMN revoked_at
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_user_password_setup_tokens_active
      ON user_password_setup_tokens (user_id)
      WHERE used_at IS NULL
    `);
  }
}
