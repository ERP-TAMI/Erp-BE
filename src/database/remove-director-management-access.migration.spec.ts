import { QueryRunner } from 'typeorm';
import { RemoveDirectorManagementAccess1740000000017 } from './migrations/1740000000017-RemoveDirectorManagementAccess';

describe('RemoveDirectorManagementAccess1740000000017', () => {
  const migration = new RemoveDirectorManagementAccess1740000000017();

  it('removes the unused director role while retaining the management permission', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ assigned_count: '0' }])
      .mockResolvedValue(undefined);

    await migration.up({ query } as unknown as QueryRunner);

    const statements = query.mock.calls.map(
      ([statement]) => statement as string,
    );
    expect(statements[0]).toContain('FROM user_roles ur');
    expect(statements[0]).toContain("r.code = 'DIRECTOR'");
    expect(statements[1]).toContain('DELETE FROM role_permissions');
    expect(statements[1]).toContain("r.code = 'DIRECTOR'");
    expect(statements[1]).toContain("p.code = 'management.area.access'");
    expect(statements[2]).toContain(
      "DELETE FROM roles WHERE code = 'DIRECTOR'",
    );
    expect(statements.join('\n')).not.toContain('DELETE FROM permissions');
    expect(statements.join('\n')).not.toContain('INSERT INTO user_roles');
  });

  it('refuses to remove director when an account still uses that role', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ assigned_count: '1' }]);

    await expect(
      migration.up({ query } as unknown as QueryRunner),
    ).rejects.toThrow(
      'Cannot remove DIRECTOR role while 1 user account is still assigned to it',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('restores the previous director role and permission mapping on rollback', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await migration.down({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain("'DIRECTOR'");
    expect(sql).toContain("p.code = 'management.area.access'");
    expect(sql).toContain('ON CONFLICT (role_id, permission_id) DO NOTHING');
  });
});
