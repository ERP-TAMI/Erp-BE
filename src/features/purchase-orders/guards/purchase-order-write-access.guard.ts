import { Injectable } from '@nestjs/common';
import { PurchaseOrderFullAccessGuard } from '../../../common/guards/purchase-order-full-access.guard';

@Injectable()
export class PurchaseOrderWriteAccessGuard extends PurchaseOrderFullAccessGuard {}
