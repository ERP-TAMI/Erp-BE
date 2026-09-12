import { AlignSystemRoleDisplayNames1740000000021 } from './migrations/1740000000021-AlignSystemRoleDisplayNames';

describe('AlignSystemRoleDisplayNames1740000000021', () => {
  it('aligns SA, RD and IT names with the approved user-management labels', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new AlignSystemRoleDisplayNames1740000000021();

    await migration.up({ query } as never);

    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain("WHEN 'SA' THEN 'SA / Giám đốc'");
    expect(sql).toContain("WHEN 'RD' THEN 'R&D'");
    expect(sql).toContain("WHEN 'IT' THEN 'IT'");
    expect(sql).toContain("WHERE code IN ('SA', 'RD', 'IT')");
  });

  it('restores the previous role names on rollback', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new AlignSystemRoleDisplayNames1740000000021();

    await migration.down({ query } as never);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("WHEN 'SA' THEN 'Quản trị hệ thống'");
    expect(sql).toContain("WHEN 'RD' THEN 'Nghiên cứu và Phát triển'");
    expect(sql).toContain("WHEN 'IT' THEN 'Công nghệ thông tin'");
  });
});
