import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ManagementDashboardQueryDto } from './management-dashboard-query.dto';

// Keep every computed OFFSET within JavaScript's exact integer range even at
// the maximum supported page size.
export const MAX_MANAGEMENT_PURCHASE_ORDER_PAGE =
  Math.floor(Number.MAX_SAFE_INTEGER / 100) + 1;

export class ManagementPurchaseOrdersQueryDto extends ManagementDashboardQueryDto {
  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    maximum: MAX_MANAGEMENT_PURCHASE_ORDER_PAGE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_MANAGEMENT_PURCHASE_ORDER_PAGE)
  page = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;
}
