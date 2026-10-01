import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { RequestUser } from '../../auth/jwt-payload.type';
import { PurchaseOrderWriteAccessGuard } from './purchase-order-write-access.guard';

@Injectable()
export class PurchaseOrderProductStatusGuard extends PurchaseOrderWriteAccessGuard {
  override canActivate(context: ExecutionContext): boolean {
    if (!super.canActivate(context)) return false;

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const roleCode = request.user?.roleCode;
    if (roleCode !== 'SA' && roleCode !== 'TPKH') {
      throw new ForbiddenException(
        'Chỉ SA và TPKH được phép khóa hoặc mở khóa sản phẩm PO.',
      );
    }

    return true;
  }
}
