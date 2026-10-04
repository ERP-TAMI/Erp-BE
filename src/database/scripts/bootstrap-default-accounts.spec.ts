import { EntityManager } from 'typeorm';
import {
  BootstrapAccount,
  createBootstrapAccount,
  readBootstrapAccounts,
} from './bootstrap-default-accounts';

const GOOD_PASSWORD = 'correct-horse-battery';

describe('readBootstrapAccounts', () => {
  it('returns nothing when no variables are set', () => {
    expect(readBootstrapAccounts({})).toEqual([]);
  });

  it('maps admin to SA and IT to IT with a normalized email', () => {
    const accounts = readBootstrapAccounts({
      BOOTSTRAP_ADMIN_EMAIL: ' Admin@Example.com ',
      BOOTSTRAP_ADMIN_PASSWORD: GOOD_PASSWORD,
      BOOTSTRAP_IT_EMAIL: 'it@example.com',
      BOOTSTRAP_IT_PASSWORD: GOOD_PASSWORD,
    });

    expect(accounts).toEqual([
      expect.objectContaining({ roleCode: 'SA', email: 'admin@example.com' }),
      expect.objectContaining({ roleCode: 'IT', email: 'it@example.com' }),
    ]);
  });

  it('rejects an email without its password', () => {
    expect(() =>
      readBootstrapAccounts({ BOOTSTRAP_ADMIN_EMAIL: 'admin@example.com' }),
    ).toThrow(/must be set together/);
  });

  it('rejects a short password', () => {
    expect(() =>
      readBootstrapAccounts({
        BOOTSTRAP_IT_EMAIL: 'it@example.com',
        BOOTSTRAP_IT_PASSWORD: 'short',
      }),
    ).toThrow(/at least 12 characters/);
  });

  it('rejects an invalid email', () => {
    expect(() =>
      readBootstrapAccounts({
        BOOTSTRAP_IT_EMAIL: 'not-an-email',
        BOOTSTRAP_IT_PASSWORD: GOOD_PASSWORD,
      }),
    ).toThrow(/not a valid email/);
  });

  it('rejects the same email for both accounts', () => {
    expect(() =>
      readBootstrapAccounts({
        BOOTSTRAP_ADMIN_EMAIL: 'same@example.com',
        BOOTSTRAP_ADMIN_PASSWORD: GOOD_PASSWORD,
        BOOTSTRAP_IT_EMAIL: 'SAME@example.com',
        BOOTSTRAP_IT_PASSWORD: GOOD_PASSWORD,
      }),
    ).toThrow(/different email/);
  });
});

describe('createBootstrapAccount', () => {
  const account: BootstrapAccount = {
    email: 'admin@example.com',
    password: GOOD_PASSWORD,
    fullName: 'Quản trị hệ thống',
    roleCode: 'SA',
  };

  function managerWith(rows: { user?: unknown[]; role?: unknown[] }) {
    return {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM users')) return rows.user ?? [];
        if (sql.includes('FROM roles')) return rows.role ?? [];
        if (sql.includes('INSERT INTO users')) return [{ id: 'new-user' }];
        return [];
      }),
    } as unknown as EntityManager & { query: jest.Mock };
  }

  it('never touches a user that already exists', async () => {
    const manager = managerWith({ user: [{ id: 'existing' }] });

    await expect(
      createBootstrapAccount(manager, account, 'hash'),
    ).resolves.toBe(false);
    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('creates an active user with the role and no forced password change', async () => {
    const manager = managerWith({ role: [{ id: 'role-sa' }] });

    await expect(
      createBootstrapAccount(manager, account, 'hash'),
    ).resolves.toBe(true);
    const insertUser = manager.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO users'),
    );
    expect(insertUser?.[0]).toContain('must_change_password');
    expect(insertUser?.[1]).toEqual([account.email, 'hash', account.fullName]);
    expect(manager.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO user_roles'),
      ['new-user', 'role-sa'],
    );
  });

  it('fails clearly when the role is missing', async () => {
    const manager = managerWith({});

    await expect(
      createBootstrapAccount(manager, account, 'hash'),
    ).rejects.toThrow(/Role code "SA" not found/);
  });
});
