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
});
