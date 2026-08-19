import { getMetadataArgsStorage } from 'typeorm';
import { AUTH_ENTITIES } from '../features/auth/entities';
import { MASTERDATA_ENTITIES } from '../features/master-data/entities';
import { DOCUMENTS_ENTITIES } from '../features/documents/entities';
import { STYLES_ENTITIES } from '../features/styles/entities';
import { DRAFTBOMS_ENTITIES } from '../features/draft-boms/entities';
import { PURCHASEORDERS_ENTITIES } from '../features/purchase-orders/entities';
import { BOMS_ENTITIES } from '../features/boms/entities';
import { PRODUCTION_ENTITIES } from '../features/production/entities';
import { NOTIFICATIONS_ENTITIES } from '../features/notifications/entities';
import { AUDIT_ENTITIES } from '../features/audit/entities';
import { PLATFORM_ENTITIES } from '../features/platform/entities';
import { MaterialGroup } from '../features/master-data/entities/MaterialGroup.entity';
import { Material } from '../features/master-data/entities/Material.entity';

const entities = [
  ...AUTH_ENTITIES,
  ...MASTERDATA_ENTITIES,
  ...DOCUMENTS_ENTITIES,
  ...STYLES_ENTITIES,
  ...DRAFTBOMS_ENTITIES,
  ...PURCHASEORDERS_ENTITIES,
  ...BOMS_ENTITIES,
  ...PRODUCTION_ENTITIES,
  ...NOTIFICATIONS_ENTITIES,
  ...AUDIT_ENTITIES,
  ...PLATFORM_ENTITIES,
];

describe('schema entities', () => {
  it('registers every schema table exactly once', () => {
    const tables = getMetadataArgsStorage()
      .tables.filter((metadata) => entities.includes(metadata.target as never))
      .map((metadata) => metadata.name);

    expect(entities).toHaveLength(61);
    expect(new Set(tables).size).toBe(61);
    expect(tables).toEqual(
      expect.arrayContaining([
        'users',
        'materials',
        'purchase_order_products',
        'bills_of_materials',
        'audit_events',
      ]),
    );
  });

  it('maps the material group display order column with a zero default', () => {
    const displayOrderColumn = getMetadataArgsStorage().columns.find(
      (column) =>
        column.target === MaterialGroup &&
        column.propertyName === 'displayOrder',
    );

    expect(displayOrderColumn?.options).toMatchObject({
      name: 'display_order',
      type: 'integer',
      default: 0,
    });
  });

  it('maps material inventory and cost fields with database defaults', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (column) => column.target === Material,
    );

    expect(columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          propertyName: 'defaultYieldPct',
          options: expect.objectContaining({
            name: 'default_yield_pct',
            type: 'numeric',
            precision: 8,
            scale: 4,
            default: 0,
          }),
        }),
        expect.objectContaining({
          propertyName: 'lastUnitCost',
          options: expect.objectContaining({
            name: 'last_unit_cost',
            type: 'numeric',
            precision: 18,
            scale: 2,
            default: 0,
          }),
        }),
        expect.objectContaining({
          propertyName: 'currentStock',
          options: expect.objectContaining({
            name: 'current_stock',
            type: 'numeric',
            precision: 18,
            scale: 4,
            default: 0,
          }),
        }),
        expect.objectContaining({
          propertyName: 'lowStockThreshold',
          options: expect.objectContaining({
            name: 'low_stock_threshold',
            type: 'numeric',
            precision: 18,
            scale: 4,
            default: 10,
          }),
        }),
      ]),
    );
  });
});
