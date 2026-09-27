import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum AggregateBreakdownType {
  NONE = 'none',
  COLOR = 'color',
  SIZE = 'size',
  COLOR_SIZE = 'color_size',
}

export class QueryBomAggregateDto {
  @ApiPropertyOptional({
    description: 'Filter by exact BOM UUID',
  })
  @IsOptional()
  @IsString()
  bomId?: string;

  @ApiPropertyOptional({
    description: 'Filter by Purchase Order code or search term',
  })
  @IsOptional()
  @IsString()
  purchaseOrder?: string;

  @ApiPropertyOptional({
    description: 'Filter by exact Purchase Order UUID',
  })
  @IsOptional()
  @IsString()
  purchaseOrderId?: string;

  @ApiPropertyOptional({
    description: 'Filter by product code, name, or search term',
  })
  @IsOptional()
  @IsString()
  product?: string;

  @ApiPropertyOptional({
    description: 'Filter by exact purchase_order_product UUID',
  })
  @IsOptional()
  @IsString()
  purchaseOrderProductId?: string;

  @ApiPropertyOptional({ description: 'Filter by Style code or Style name' })
  @IsOptional()
  @IsString()
  style?: string;

  @ApiPropertyOptional({ description: 'Filter by exact Style UUID' })
  @IsOptional()
  @IsString()
  styleId?: string;

  @ApiPropertyOptional({ description: 'Filter by exact material UUID' })
  @IsOptional()
  @IsString()
  materialId?: string;

  @ApiPropertyOptional({
    description:
      'Search term across material name snapshot, group snapshot, or product/PO code',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: AggregateBreakdownType,
    description:
      'Breakdown level for material quantities: none | color | size | color_size',
    default: AggregateBreakdownType.NONE,
  })
  @IsOptional()
  @IsEnum(AggregateBreakdownType)
  breakdown?: AggregateBreakdownType = AggregateBreakdownType.NONE;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size limit', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
