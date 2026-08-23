import { EntityManager } from 'typeorm';
import { seedAuthTestAccount, SeedAccount } from './seed-auth-test-accounts';

function createManagerMock(
  queryImpl: (sql: string, params?: unknown[]) => unknown,
) {
  return {
    query: jest.fn(queryImpl),
  } as unknown as EntityManager;
}

const account: SeedAccount = {
  email: 'sa@tami.test',
  fullName: 'Quản trị hệ thống',
  roleCode: 'SA',
};

describe('seedAuthTestAccount', () => {
  it('throws when the role code does not exist', async () => {
    const manager = createManagerMock((sql: string) => {
      if (sql.includes('FROM roles')) return [];
      return [];
    });

    await expect(
      seedAuthTestAccount(manager, account, 'hashed'),
    ).rejects.toThrow(/Role code "SA" not found/);
  });

  it('creates a new user and assigns the role when the email does not exist', async () => {
    const manager = createManagerMock((sql: string) => {
      if (sql.includes('FROM roles')) return [{ id: 'role-1' }];
      if (sql.includes('FROM users')) return [];
      if (sql.startsWith('INSERT INTO users')) return [{ id: 'user-1' }];
      return [];
    });

    await seedAuthTestAccount(manager, account, 'hashed');

    const calls = (manager.query as jest.Mock).mock.calls.map((c) => c[0]);
    expect(
      calls.some((sql: string) => sql.startsWith('INSERT INTO users')),
    ).toBe(true);
    expect(calls.some((sql: string) => sql.startsWith('UPDATE users'))).toBe(
      false,
    );
    expect(
      calls.some((sql: string) => sql.startsWith('DELETE FROM user_roles')),
    ).toBe(true);
    expect(
      calls.some((sql: string) => sql.startsWith('INSERT INTO user_roles')),
    ).toBe(true);
  });

  it('updates the existing user and re-assigns the role when the email already exists', async () => {
    const manager = createManagerMock((sql: string) => {
      if (sql.includes('FROM roles')) return [{ id: 'role-1' }];
      if (sql.includes('FROM users')) return [{ id: 'user-1' }];
      return [];
    });

    await seedAuthTestAccount(manager, account, 'hashed');

    const calls = (manager.query as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls.some((sql: string) => sql.startsWith('UPDATE users'))).toBe(
      true,
    );
    expect(
      calls.some((sql: string) => sql.startsWith('INSERT INTO users')),
    ).toBe(false);
    expect(
      calls.some((sql: string) => sql.startsWith('DELETE FROM user_roles')),
    ).toBe(true);
    expect(
      calls.some((sql: string) => sql.startsWith('INSERT INTO user_roles')),
    ).toBe(true);
  });

  it('always deletes existing user_roles before inserting the new one (single-role invariant)', async () => {
    const manager = createManagerMock((sql: string) => {
      if (sql.includes('FROM roles')) return [{ id: 'role-1' }];
      if (sql.includes('FROM users')) return [{ id: 'user-1' }];
      return [];
    });

    await seedAuthTestAccount(manager, account, 'hashed');

    const calls = (manager.query as jest.Mock).mock.calls.map((c) => c[0]);
    const deleteIndex = calls.findIndex((sql: string) =>
      sql.startsWith('DELETE FROM user_roles'),
    );
    const insertIndex = calls.findIndex((sql: string) =>
      sql.startsWith('INSERT INTO user_roles'),
    );
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeGreaterThan(deleteIndex);
  });
});
