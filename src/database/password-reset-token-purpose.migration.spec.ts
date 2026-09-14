import { QueryRunner } from 'typeorm';
import { AddPasswordResetTokenPurpose1740000000024 } from './migrations/1740000000024-AddPasswordResetTokenPurpose';

describe('AddPasswordResetTokenPurpose1740000000024', () => {
  it('backfills existing tokens and constrains future token purposes', async () => {
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;

    await new AddPasswordResetTokenPurpose1740000000024().up(queryRunner);

    const sql = (queryRunner.query as jest.Mock).mock.calls.join('\n');
    expect(sql).toContain("DEFAULT 'account_setup'");
    expect(sql).toContain("'password_reset'");
    expect(sql).toContain('ck_user_password_setup_tokens_purpose');
  });

  it('revokes active reset tokens before removing their purpose on rollback', async () => {
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;

    await new AddPasswordResetTokenPurpose1740000000024().down(queryRunner);

    const sql = (queryRunner.query as jest.Mock).mock.calls.join('\n');
    expect(sql).toContain("WHERE purpose = 'password_reset'");
    expect(sql).toContain('SET revoked_at = COALESCE(revoked_at, now())');
  });
});
