import { CorrectPlanningRoleNames1740000000020 } from './migrations/1740000000020-CorrectPlanningRoleNames';

describe('CorrectPlanningRoleNames1740000000020', () => {
  it('updates only the TPKH and NVKH role labels without editing an old migration', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new CorrectPlanningRoleNames1740000000020();

    await migration.up({ query } as never);

    const sql = query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n');
    expect(sql).toContain('Trưởng phòng Kế hoạch');
    expect(sql).toContain('Nhân viên Kế hoạch');
    expect(sql).toContain("code = 'TPKH'");
    expect(sql).toContain("code = 'NVKH'");
    expect(sql).not.toContain("code = 'SA'");
    expect(sql).not.toContain("code = 'RD'");
    expect(sql).not.toContain("code = 'IT'");
  });
});
