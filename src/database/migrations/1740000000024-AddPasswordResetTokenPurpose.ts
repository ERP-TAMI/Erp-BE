import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordResetTokenPurpose1740000000024 implements MigrationInterface {
  name = 'AddPasswordResetTokenPurpose1740000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_password_setup_tokens
        ADD COLUMN purpose varchar(32) NOT NULL DEFAULT 'account_setup'
    `);
    await queryRunner.query(`
      ALTER TABLE user_password_setup_tokens
        ADD CONSTRAINT ck_user_password_setup_tokens_purpose
        CHECK (purpose IN ('account_setup', 'password_reset'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE user_password_setup_tokens
      SET revoked_at = COALESCE(revoked_at, now())
      WHERE purpose = 'password_reset'
        AND used_at IS NULL
        AND revoked_at IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE user_password_setup_tokens
        DROP CONSTRAINT ck_user_password_setup_tokens_purpose,
        DROP COLUMN purpose
    `);
  }
}
