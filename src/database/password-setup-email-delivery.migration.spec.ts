import { QueryRunner } from 'typeorm';
import { AddPasswordSetupEmailDelivery1740000000022 } from './migrations/1740000000022-AddPasswordSetupEmailDelivery';

describe('AddPasswordSetupEmailDelivery1740000000022', () => {
  const migration = new AddPasswordSetupEmailDelivery1740000000022();

  it('adds constrained delivery tracking fields to setup tokens', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await migration.up({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('ADD COLUMN delivery_status');
    expect(sql).toContain("DEFAULT 'pending'");
    expect(sql).toContain('ADD COLUMN delivery_attempted_at timestamptz');
    expect(sql).toContain(
      "CHECK (delivery_status IN ('pending', 'sent', 'failed'))",
    );
  });

  it('removes delivery tracking fields on rollback', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await migration.down({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('DROP COLUMN delivery_attempted_at');
    expect(sql).toContain('DROP COLUMN delivery_status');
  });
});
