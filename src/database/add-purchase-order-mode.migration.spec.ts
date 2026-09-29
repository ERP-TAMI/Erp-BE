import { QueryRunner } from 'typeorm';
import { AddPurchaseOrderMode1740000000036 } from './migrations/1740000000036-AddPurchaseOrderMode';

describe('AddPurchaseOrderMode1740000000036', () => {
  const migration = new AddPurchaseOrderMode1740000000036();

  it('adds per-user PO mode with a safe read-only default', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await migration.up({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ADD COLUMN purchase_order_mode'),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DEFAULT 'READ_ONLY'"),
    );
  });

  it('removes only the new PO mode column on rollback', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await migration.down({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DROP COLUMN purchase_order_mode'),
    );
  });
});
