import { ForbiddenException } from '@nestjs/common';

const MANAGEMENT_ACCESS_PERMISSION = 'management.area.access';

type PurchaseOrderWriteActor = {
  roleCode: string;
  permissions: string[];
  purchaseOrderMode?: string;
};

export function assertPurchaseOrderWriteAccess(
  user: PurchaseOrderWriteActor,
): void {
  const hasManagementAccess = user.permissions.includes(
    MANAGEMENT_ACCESS_PERMISSION,
  );
  const canWrite = user.roleCode === 'SA' || !hasManagementAccess;

  if (!canWrite) {
    throw new ForbiddenException('Chế độ PO hiện tại là chỉ xem.');
  }
}
