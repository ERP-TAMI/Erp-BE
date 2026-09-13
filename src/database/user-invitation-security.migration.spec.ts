import { QueryRunner } from 'typeorm';
import { AddUserInvitationSecurity1740000000019 } from './migrations/1740000000019-AddUserInvitationSecurity';

describe('AddUserInvitationSecurity1740000000019', () => {
  const migration = new AddUserInvitationSecurity1740000000019();

  it('checks duplicate emails before normalizing and creating the invitation schema', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await migration.up({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql.indexOf('GROUP BY lower(btrim(email))')).toBeLessThan(
      sql.indexOf('UPDATE users SET email = lower(btrim(email))'),
    );
    expect(sql).toContain('CREATE UNIQUE INDEX uq_users_email_ci');
    expect(sql).toContain('ADD COLUMN auth_version integer NOT NULL DEFAULT 1');
    expect(sql).toContain('ADD COLUMN manually_locked_at timestamptz');
    expect(sql).toContain('CREATE TABLE user_password_setup_tokens');
    expect(sql).toContain('token_hash char(64) NOT NULL UNIQUE');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX uq_user_password_setup_tokens_active',
    );
    expect(sql).toContain('WHERE used_at IS NULL');
    expect(sql).not.toContain('token varchar');
  });

  it('restores the original email constraint on rollback', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await migration.down({ query } as unknown as QueryRunner);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('DROP TABLE user_password_setup_tokens');
    expect(sql).toContain('DROP INDEX uq_users_email_ci');
    expect(sql).toContain('CONSTRAINT uq_users_email UNIQUE (email)');
  });
});
