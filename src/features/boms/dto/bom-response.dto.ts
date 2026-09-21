import {
  BomRevisionStatus,
  BomType,
} from '../../../common/enums/database.enums';

export interface StyleSummaryDto {
  id: string;
  styleCode: string;
  styleName: string;
  category?: string | null;
  status?: string | null;
  baseImageKey?: string | null;
}

export interface PurchaseOrderSummaryDto {
  id: string;
  poCode: string;
  customerPoCode?: string | null;
  customerName?: string | null;
  receivedDate?: Date | null;
  deadline?: Date | null;
  status?: string | null;
}

export interface ProductColorSizeDto {
  id: string;
  sizeLabel: string;
  quantity: number;
  orderIndex: number;
}

export interface ProductColorDetailDto {
  id: string;
  colorName: string;
  orderIndex: number;
  totalQuantity: number;
  sizes: ProductColorSizeDto[];
}

export interface PurchaseOrderProductSummaryDto {
  id: string;
  purchaseOrderId: string;
  productCode: string;
  productName: string;
  category?: string | null;
  deadline?: Date | null;
  status?: string | null;
  colors: string[]; // List of color names for summary
}

export interface PurchaseOrderProductDetailDto {
  id: string;
  purchaseOrderId: string;
  productCode: string;
  productName: string;
  category?: string | null;
  deadline?: Date | null;
  status?: string | null;
  purchaseOrder?: PurchaseOrderSummaryDto | null;
  colors: ProductColorDetailDto[];
}

export interface BomRevisionSummaryDto {
  id: string;
  bomId: string;
  revisionNo: number;
  status: BomRevisionStatus;
  changeReason?: string | null;
  sourceRevisionId?: string | null;
  createdBy?: string | null;
  createdAt: Date;
  approvedBy?: string | null;
  approvedAt?: Date | null;
}

export interface BomLineResponseDto {
  id: string;
  revisionId: string;
  materialId: string | null;
  materialNameSnapshot: string;
  materialGroupId: string | null;
  materialGroupSnapshot: string | null;
  unitId: string | null;
  unitSnapshot: string;
  consumption: number;
  unitCost: number | null; // Masked to null if not permitted
  lineCost: number | null; // Masked to null if not permitted or unitCost is null
  note: string | null;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BomListItemDto {
  id: string;
  bomCode: string;
  type: BomType;
  status: string; // e.g. 'discontinued' or BomRevisionStatus
  discontinuedAt: Date | null;
  discontinuedReason?: string | null;
  style: StyleSummaryDto | null;
  purchaseOrder: PurchaseOrderSummaryDto | null;
  product: PurchaseOrderProductSummaryDto | null;
  currentRevision: BomRevisionSummaryDto | null;
  revisionNo: number | null;
  costPerUnit: number | null; // Masked to null if not permitted
  currentOrderQuantity: number | null; // null for Fit BOM
  currentOrderCost: number | null; // null for Fit BOM or if masked
  colorNameSnapshot: string | null; // Legacy snapshot preserved
  deadline: Date | null;
  rdNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BomDetailDto {
  id: string;
  bomCode: string;
  type: BomType;
  status: string;
  deadline: Date | null;
  rdNote: string | null;
  discontinuedAt: Date | null;
  discontinuedBy: string | null;
  discontinuedReason: string | null;
  colorNameSnapshot: string | null;
  style: StyleSummaryDto | null;
  product?: PurchaseOrderProductSummaryDto | null;
  purchaseOrderProduct: PurchaseOrderProductDetailDto | null;
  purchaseOrder: PurchaseOrderSummaryDto | null;
  currentRevision: BomRevisionSummaryDto | null;
  lines: BomLineResponseDto[];
  costPerUnit: number | null;
  currentOrderQuantity: number | null;
  currentOrderCost: number | null;
  rowVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BomStatsDto {
  total: number;
  draftCount: number;
  pendingCount: number;
  approvedCount: number;
  discontinuedCount: number;
  byStatus: Record<string, number>;
}
