import { getMetadataArgsStorage } from 'typeorm';
import { Material } from '../features/master-data/entities/Material.entity';

describe('Material entity inventory and cost metadata', () => {
  const columns = getMetadataArgsStorage().columns.filter(
    (column) => column.target === Material,
  );

  it('maps defaultYieldPct to the expected non-null numeric column', () => {
    const column = columns.find(
      (metadata) => metadata.propertyName === 'defaultYieldPct',
    );

    expect(column).toBeDefined();
    expect(column?.options).toMatchObject({
      type: 'numeric',
      name: 'default_yield_pct',
      precision: 8,
      scale: 4,
      default: 0,
      nullable: false,
    });
  });
});
