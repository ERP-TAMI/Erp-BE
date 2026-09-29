import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RequestUser } from '../../../features/auth/jwt-payload.type';
import { assertPurchaseOrderWriteAccess } from '../../../common/security/purchase-order-write-access';
import { StorageEntityType } from '../dto/presign-upload.dto';

@Injectable()
export class PurchaseOrderUploadWriteAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: RequestUser;
      body?: { entityType?: StorageEntityType };
    }>();

    if (request.body?.entityType !== StorageEntityType.PURCHASE_ORDER) {
      return true;
    }
    if (!request.user) {
      return false;
    }

    assertPurchaseOrderWriteAccess(request.user);
    return true;
  }
}
