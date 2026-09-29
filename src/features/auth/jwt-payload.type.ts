import { PurchaseOrderMode } from '../../common/enums/purchase-order-mode.enum';

export type JwtPayload = {
  sub: string;
  email: string;
  roleCode: string;
  permissions: string[];
  authVersion: number;
};

export type RequestUser = {
  id: string;
  email: string;
  roleCode: string;
  permissions: string[];
  purchaseOrderMode: PurchaseOrderMode;
};
