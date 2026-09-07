import { QueryRunner } from 'typeorm';
import { AddManagementAreaAccess1740000000016 } from './migrations/1740000000016-AddManagementAreaAccess';

describe('AddManagementAreaAccess1740000000016', () => {
  const migration = new AddManagementAreaAccess1740000000016();

  it('creates the director role and grants management access to director and admin', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await migration.up({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain("'DIRECTOR'");
    expect(sql).toContain("'management.area.access'");
    expect(sql).toContain("r.code IN ('SA', 'DIRECTOR')");
    expect(sql).toContain('ON CONFLICT (role_id, permission_id) DO NOTHING');
  });

  it('removes the permission and only deletes an unused director role', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await migration.down({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain("p.code = 'management.area.access'");
    expect(sql).toContain(
      "DELETE FROM permissions WHERE code = 'management.area.access'",
    );
    expect(sql).toContain("WHERE r.code = 'DIRECTOR'");
    expect(sql).toContain('FROM user_roles ur');
    expect(sql).toContain('WHERE ur.role_id = r.id');
    expect(sql).toContain('AND NOT EXISTS');
  });
});
