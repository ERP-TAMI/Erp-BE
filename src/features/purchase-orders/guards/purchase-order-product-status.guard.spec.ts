import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { PurchaseOrderMode } from '../../../common/enums/purchase-order-mode.enum';
import type { RequestUser } from '../../auth/jwt-payload.type';
import { PurchaseOrderProductStatusGuard } from './purchase-order-product-status.guard';

function makeUser(
  roleCode: string,
  purchaseOrderMode = PurchaseOrderMode.FULL_ACCESS,
  permissions: string[] = [],
): RequestUser {
  return {
    id: 'user-1',
    email: `${roleCode.toLowerCase()}@tami.test`,
    roleCode,
    permissions,
    purchaseOrderMode,
  };
}

function makeContext(user: RequestUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PurchaseOrderProductStatusGuard', () => {
  const guard = new PurchaseOrderProductStatusGuard();

  it.each(['SA', 'TPKH'])(
    'allows %s to lock or unlock a PO product when PO write access is available',
    (roleCode) => {
      expect(guard.canActivate(makeContext(makeUser(roleCode)))).toBe(true);
    },
  );

  it.each(['RD', 'NVKH', 'ACCOUNTING', 'IT'])(
    'rejects %s from locking or unlocking a PO product',
    (roleCode) => {
      expect(() => guard.canActivate(makeContext(makeUser(roleCode)))).toThrow(
        ForbiddenException,
      );
    },
  );

  it('allows SA regardless of the legacy PO mode', () => {
    expect(() =>
      guard.canActivate(
        makeContext(makeUser('SA', PurchaseOrderMode.READ_ONLY)),
      ),
    ).not.toThrow();
  });
});
