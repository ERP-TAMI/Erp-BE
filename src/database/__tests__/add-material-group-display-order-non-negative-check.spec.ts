import { QueryRunner } from 'typeorm';
import { AddMaterialGroupDisplayOrderNonNegativeCheck1740000000001 } from '../migrations/1740000000001-AddMaterialGroupDisplayOrderNonNegativeCheck';

describe('AddMaterialGroupDisplayOrderNonNegativeCheck1740000000001', () => {
  it('adds the material group display order non-negative constraint', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration =
      new AddMaterialGroupDisplayOrderNonNegativeCheck1740000000001();

    await migration.up({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('CHECK (display_order >= 0)'),
    );
  });
});
