import { QueryRunner } from 'typeorm';
import { AddPasswordSetupTokenRevocation1740000000023 } from './migrations/1740000000023-AddPasswordSetupTokenRevocation';

describe('AddPasswordSetupTokenRevocation1740000000023', () => {
  it('adds revoked_at and updates the active-token unique index', async () => {
    const queryRunner = { query: jest.fn() } as unknown as QueryRunner;

    await new AddPasswordSetupTokenRevocation1740000000023().up(queryRunner);

    const sql = (queryRunner.query as jest.Mock).mock.calls.join('\n');
    expect(sql).toContain('ADD COLUMN revoked_at timestamptz');
    expect(sql).toContain('WHERE used_at IS NULL AND revoked_at IS NULL');
  });
});
