import { ForbiddenException } from '@nestjs/common';
import { PurchaseOrderMode } from '../enums/purchase-order-mode.enum';

const MANAGEMENT_ACCESS_PERMISSION = 'management.area.access';

type PurchaseOrderWriteActor = {
  roleCode: string;
  permissions: string[];
  purchaseOrderMode: PurchaseOrderMode;
};

export function assertPurchaseOrderWriteAccess(
  user: PurchaseOrderWriteActor,
): void {
  const hasManagementAccess = user.permissions.includes(
    MANAGEMENT_ACCESS_PERMISSION,
  );
  const canWrite =
    user.roleCode === 'SA'
      ? user.purchaseOrderMode === PurchaseOrderMode.FULL_ACCESS
      : !hasManagementAccess;

  if (!canWrite) {
    throw new ForbiddenException('Chế độ PO hiện tại là chỉ xem.');
  }
}
