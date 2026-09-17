import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserInvitationSecurity1740000000019 implements MigrationInterface {
  name = 'AddUserInvitationSecurity1740000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM users
          GROUP BY lower(btrim(email))
          HAVING count(*) > 1
        ) THEN
          RAISE EXCEPTION 'Cannot enforce case-insensitive user email uniqueness: duplicate emails exist';
        END IF;
      END $$;
    `);
    await queryRunner.query(`UPDATE users SET email = lower(btrim(email))`);
    await queryRunner.query(
      `ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_email`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_users_email_ci ON users (lower(btrim(email)))`,
    );
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN auth_version integer NOT NULL DEFAULT 1,
        ADD COLUMN manually_locked_at timestamptz,
        ADD COLUMN manually_locked_by uuid
    `);
    await queryRunner.query(`
      ALTER TABLE users
        ADD CONSTRAINT fk_users_manually_locked_by
        FOREIGN KEY (manually_locked_by) REFERENCES users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE TABLE user_password_setup_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash char(64) NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX ix_user_password_setup_tokens_expiry
      ON user_password_setup_tokens (expires_at)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_user_password_setup_tokens_active
      ON user_password_setup_tokens (user_id)
      WHERE used_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE user_password_setup_tokens`);
    await queryRunner.query(
      `ALTER TABLE users DROP CONSTRAINT fk_users_manually_locked_by`,
    );
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN manually_locked_by,
        DROP COLUMN manually_locked_at,
        DROP COLUMN auth_version
    `);
    await queryRunner.query(`DROP INDEX uq_users_email_ci`);
    await queryRunner.query(
      `ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email)`,
    );
  }
}
