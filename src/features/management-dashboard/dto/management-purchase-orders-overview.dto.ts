import { ApiProperty } from '@nestjs/swagger';
import { PoStatus } from '../../../common/enums/database.enums';

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
