import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RequestUser } from '../../features/auth/jwt-payload.type';
import { assertPurchaseOrderWriteAccess } from '../security/purchase-order-write-access';

@Injectable()
export class PurchaseOrderFullAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: RequestUser;
    }>();

    if (!request.user) {
      return false;
    }

    assertPurchaseOrderWriteAccess(request.user);
    return true;
  }
}
