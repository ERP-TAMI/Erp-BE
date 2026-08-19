import { AddMaterialSizeUniqueConstraint1760000000000 } from '../migrations/1760000000000-AddMaterialSizeUniqueConstraint';

describe('AddMaterialSizeUniqueConstraint migration', () => {
  it('adds and removes the material-size uniqueness constraint', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new AddMaterialSizeUniqueConstraint1760000000000();

    await migration.up({ query } as never);
    await migration.down({ query } as never);

    expect(query.mock.calls[0][0]).toContain('UNIQUE (material_id, size_code)');
    expect(query.mock.calls[1][0]).toContain(
      'DROP CONSTRAINT uq_material_sizes_material_id_size_code',
    );
  });
});
