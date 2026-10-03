import { ApiProperty } from '@nestjs/swagger';
import type { DashboardSummaryPeriod } from './dashboard-summary-query.dto';

class DashboardTrendDto {
  @ApiProperty({ example: '2026-10-01' })
  period: string;

  @ApiProperty({ example: 12, minimum: 0 })
  received: number;

  @ApiProperty({ example: 8, minimum: 0 })
  completed: number;
}

class DashboardTrendComparisonBucketDto {
  @ApiProperty({ example: '2026-09-01' })
  period: string;

  @ApiProperty({ example: 4, minimum: 0, nullable: true })
  received: number | null;
}

class DashboardTrendComparisonDto {
  @ApiProperty({ example: '2026-09-01', format: 'date' })
  periodStart: string;

  @ApiProperty({ example: '2026-09-30', format: 'date' })
  periodEnd: string;

  @ApiProperty({ example: '2026-10-02', format: 'date' })
  currentEnd: string;

  @ApiProperty({ type: [DashboardTrendComparisonBucketDto] })
  trend: DashboardTrendComparisonBucketDto[];
}

class DashboardCountByStatusDto {
  @ApiProperty({ example: 'in_progress' })
  status: string;

  @ApiProperty({ example: 12, minimum: 0 })
  count: number;
}

class DashboardCustomerCountDto {
  @ApiProperty({ example: 'Khách hàng A' })
  customerName: string;

  @ApiProperty({ example: 12, minimum: 0 })
  count: number;
}

class DashboardPurchaseOrderQueueItemDto {
  @ApiProperty({ format: 'uuid' })
  purchaseOrderId: string;

  @ApiProperty({ example: 'PO-2026-001' })
  poCode: string;

  @ApiProperty({ example: 'Khách hàng A' })
  customerName: string;

  @ApiProperty({ example: '2026-09-30' })
  deadline: string;

  @ApiProperty({
    example: 2,
    minimum: 0,
    description:
      'Overdue products for overdueQueue; open products (including zero) for upcomingQueue.',
  })
  productCount: number;
}

class DashboardBomQueueItemDto {
  @ApiProperty({ format: 'uuid' })
  bomId: string;

  @ApiProperty({ example: 'BOM-2026-001' })
  bomCode: string;

  @ApiProperty({ example: 'Áo thun cổ tròn' })
  productName: string;

  @ApiProperty({ enum: ['fit', 'po'] })
  bomType: string;

  @ApiProperty({
    enum: [
      'wait_nvkh',
      'wait_rd',
      'wait_tpkh_confirm',
      'wait_accounting',
      'wait_sa_approve',
    ],
  })
  status: string;

  @ApiProperty({ example: '2026-09-30T10:00:00.000Z' })
  createdAt: string;
}

export class ManagementDashboardSummaryDto {
  @ApiProperty({ enum: ['month', 'year', 'range', 'all'], example: 'month' })
  periodType: DashboardSummaryPeriod['periodType'];

  @ApiProperty({ example: '2026-10-01', format: 'date' })
  periodStart: string;

  @ApiProperty({ example: '2026-10-31', format: 'date' })
  periodEnd: string;

  @ApiProperty({ enum: ['day', 'month', 'year'], example: 'day' })
  trendGranularity: 'day' | 'month' | 'year';

  @ApiProperty({ example: 12, minimum: 0 })
  totalPurchaseOrders: number;

  @ApiProperty({ example: 5, minimum: 0 })
  completedPurchaseOrders: number;

  @ApiProperty({ example: 2, minimum: 0 })
  cancelledPurchaseOrders: number;

  @ApiProperty({ example: 38, minimum: 0 })
  processingPurchaseOrders: number;

  @ApiProperty({ example: 7, minimum: 0 })
  overdueProductPurchaseOrders: number;

  @ApiProperty({
    example: 9,
    minimum: 0,
    description:
      'Open POs due from today through seven days ahead in Vietnam time, regardless of intake period or product deadlines. Legacy property name retained for compatibility.',
  })
  upcomingProductPurchaseOrders: number;

  @ApiProperty({ example: 18, minimum: 0 })
  pendingBomCount: number;

  @ApiProperty({ type: [DashboardTrendDto] })
  trend: DashboardTrendDto[];

  @ApiProperty({ type: DashboardTrendComparisonDto, nullable: true })
  comparison: DashboardTrendComparisonDto | null;

  @ApiProperty({ type: [DashboardCountByStatusDto] })
  purchaseOrderStatuses: DashboardCountByStatusDto[];

  @ApiProperty({ type: [DashboardCountByStatusDto] })
  bomRevisionStatuses: DashboardCountByStatusDto[];

  @ApiProperty({ type: [DashboardCustomerCountDto] })
  topCustomers: DashboardCustomerCountDto[];

  @ApiProperty({ type: [DashboardPurchaseOrderQueueItemDto] })
  overdueQueue: DashboardPurchaseOrderQueueItemDto[];

  @ApiProperty({ type: [DashboardPurchaseOrderQueueItemDto] })
  upcomingQueue: DashboardPurchaseOrderQueueItemDto[];

  @ApiProperty({ type: [DashboardBomQueueItemDto] })
  pendingBomQueue: DashboardBomQueueItemDto[];

  @ApiProperty({ example: 24, minimum: 0, required: false })
  activeEmployees?: number;
}
