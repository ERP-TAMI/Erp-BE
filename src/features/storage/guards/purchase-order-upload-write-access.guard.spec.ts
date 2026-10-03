import { ExecutionContext } from '@nestjs/common';
import { PurchaseOrderMode } from '../../../common/enums/purchase-order-mode.enum';
import { PurchaseOrderUploadWriteAccessGuard } from './purchase-order-upload-write-access.guard';
import { StorageEntityType } from '../dto/presign-upload.dto';

describe('PurchaseOrderUploadWriteAccessGuard', () => {
  const guard = new PurchaseOrderUploadWriteAccessGuard();

  function context(body: unknown, user: unknown): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ body, user }),
      }),
    } as ExecutionContext;
  }

  const saReadOnly = {
    id: 'sa-1',
    email: 'sa@tami.test',
    roleCode: 'SA',
    permissions: ['management.area.access'],
    purchaseOrderMode: PurchaseOrderMode.READ_ONLY,
  };

  it('allows SA to request a PO upload URL regardless of the legacy mode', () => {
    expect(() =>
      guard.canActivate(
        context({ entityType: StorageEntityType.PURCHASE_ORDER }, saReadOnly),
      ),
    ).not.toThrow();
  });

  it('allows an SA in full-access mode to request a PO upload URL', () => {
    expect(
      guard.canActivate(
        context(
          { entityType: StorageEntityType.PURCHASE_ORDER },
          { ...saReadOnly, purchaseOrderMode: PurchaseOrderMode.FULL_ACCESS },
        ),
      ),
    ).toBe(true);
  });

  it('does not apply PO mode to style image uploads', () => {
    expect(
      guard.canActivate(
        context({ entityType: StorageEntityType.STYLE }, saReadOnly),
      ),
    ).toBe(true);
  });
});
