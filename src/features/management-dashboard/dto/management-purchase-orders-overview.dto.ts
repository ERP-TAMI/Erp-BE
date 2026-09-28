import { ApiProperty } from '@nestjs/swagger';
import { PoStatus } from '../../../common/enums/database.enums';

export enum ManagementPurchaseOrderSummaryStatus {
  NOT_COMPLETED = 'not_completed',
  COMPLETED = 'completed',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
}

export class ManagementPurchaseOrderItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  poCode: string;

  @ApiProperty()
  customerNameSnapshot: string;

  @ApiProperty({ example: '2026-09-01', format: 'date' })
  receivedDate: string;

  @ApiProperty({ example: '2026-09-30', format: 'date' })
  deadline: string;

  @ApiProperty({ enum: PoStatus, enumName: 'PoStatus' })
  status: PoStatus;

  @ApiProperty({
    enum: ManagementPurchaseOrderSummaryStatus,
    enumName: 'ManagementPurchaseOrderSummaryStatus',
    description:
      'Management-level status. Cancellation and completion take precedence over deadline overdue.',
  })
  managementStatus: ManagementPurchaseOrderSummaryStatus;

  @ApiProperty({
    example: -2,
    description:
      'Signed number of days from the Vietnam business date to the PO deadline; negative means overdue.',
  })
  daysToDeadline: number;
}

export class ManagementPurchaseOrdersMetaDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

export class ManagementPurchaseOrdersOverviewDto {
  @ApiProperty({ example: '2026-09' })
  month: string;

  @ApiProperty()
  totalPurchaseOrders: number;

  @ApiProperty()
  overduePurchaseOrders: number;

  @ApiProperty()
  upcomingPurchaseOrders: number;

  @ApiProperty({ type: [ManagementPurchaseOrderItemDto] })
  items: ManagementPurchaseOrderItemDto[];

  @ApiProperty({ type: ManagementPurchaseOrdersMetaDto })
  meta: ManagementPurchaseOrdersMetaDto;
}
