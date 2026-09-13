import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordSetupEmailDelivery1740000000022 implements MigrationInterface {
  name = 'AddPasswordSetupEmailDelivery1740000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_password_setup_tokens
        ADD COLUMN delivery_status varchar(16) NOT NULL DEFAULT 'pending',
        ADD COLUMN delivery_attempted_at timestamptz,
        ADD CONSTRAINT ck_user_password_setup_tokens_delivery_status
          CHECK (delivery_status IN ('pending', 'sent', 'failed'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_password_setup_tokens
        DROP CONSTRAINT ck_user_password_setup_tokens_delivery_status,
        DROP COLUMN delivery_attempted_at,
        DROP COLUMN delivery_status
    `);
  }
}
