import { ExecutionContext, Injectable } from '@nestjs/common';
import { PurchaseOrderFullAccessGuard } from '../../../common/guards/purchase-order-full-access.guard';

@Injectable()
export class PurchaseOrderDownloadAccessGuard extends PurchaseOrderFullAccessGuard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      query?: { objectKey?: string; download?: string };
    }>();
    const objectKey = request.query?.objectKey;
    const isPurchaseOrderDownload =
      request.query?.download === 'true' &&
      typeof objectKey === 'string' &&
      /^purchase-orders\/[^/]+\//.test(objectKey);

    return isPurchaseOrderDownload ? super.canActivate(context) : true;
  }
}
