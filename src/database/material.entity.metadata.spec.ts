import { getMetadataArgsStorage } from 'typeorm';
import { Material } from '../features/master-data/entities/Material.entity';

describe('Material entity inventory and cost metadata', () => {
  const columns = getMetadataArgsStorage().columns.filter(
    (column) => column.target === Material,
  );

  it.each([
    ['defaultYieldPct', 'default_yield_pct', 8, 4, 0],
    ['lastUnitCost', 'last_unit_cost', 18, 2, 0],
    ['currentStock', 'current_stock', 18, 4, 0],
    ['lowStockThreshold', 'low_stock_threshold', 18, 4, 10],
  ] as const)(
    'maps %s to the expected non-null numeric column',
    (propertyName, databaseName, precision, scale, defaultValue) => {
      const column = columns.find(
        (metadata) => metadata.propertyName === propertyName,
      );

      expect(column).toBeDefined();
      expect(column?.options).toMatchObject({
        type: 'numeric',
        name: databaseName,
        precision,
        scale,
        default: defaultValue,
        nullable: false,
      });
    },
  );
});
