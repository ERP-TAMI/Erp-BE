import { getMetadataArgsStorage } from 'typeorm';
import { AUTH_ENTITIES } from '../features/auth/entities';
import { MASTERDATA_ENTITIES } from '../features/master-data/entities';
import { DOCUMENTS_ENTITIES } from '../features/documents/entities';
import { FolderDocument } from '../features/documents/entities/FolderDocument.entity';
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

    expect(entities).toHaveLength(62);
    expect(new Set(tables).size).toBe(62);
    expect(tables).toEqual(
      expect.arrayContaining([
        'users',
        'user_password_setup_tokens',
        'materials',
        'purchase_order_products',
        'boms',
        'audit_events',
        'http_audit_logs',
      ]),
    );
  });

  it('maps folder document keys to the database snake case columns', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (metadata) => metadata.target === FolderDocument,
    );

    expect(columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          propertyName: 'folderId',
          options: { type: 'uuid', name: 'folder_id', primary: true },
        }),
        expect.objectContaining({
          propertyName: 'documentId',
          options: { type: 'uuid', name: 'document_id', primary: true },
        }),
      ]),
    );
  });
});
