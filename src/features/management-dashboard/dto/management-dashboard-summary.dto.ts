import { ApiProperty } from '@nestjs/swagger';

export class ManagementDashboardSummaryDto {
  @ApiProperty({ example: '2026-09' })
  month: string;

  @ApiProperty({ example: 12, minimum: 0 })
  totalPurchaseOrders: number;

  @ApiProperty({ example: 5, minimum: 0 })
  completedPurchaseOrders: number;

  @ApiProperty({ example: 3, minimum: 0 })
  overduePurchaseOrders: number;

  @ApiProperty({ example: 24, minimum: 0 })
  activeEmployees: number;
}
