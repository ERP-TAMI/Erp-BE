import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum AggregateBreakdownType {
  NONE = 'none',
  COLOR = 'color',
  SIZE = 'size',
  COLOR_SIZE = 'color_size',
}

export class QueryBomAggregateDto {
  @ApiPropertyOptional({
    description: 'Filter NPLs by creation month in YYYY-MM format',
    example: '2026-09',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be in YYYY-MM format (e.g. 2026-09)',
  })
  month?: string;

  @ApiPropertyOptional({
    description: 'Filter NPLs by creation year in YYYY format',
    example: '2026',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d{3}$/, {
    message: 'year must be in YYYY format (e.g. 2026)',
  })
  year?: string;

  @ApiPropertyOptional({
    description: 'Filter NPLs created on or after this UTC date (YYYY-MM-DD)',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter NPLs created through this UTC date (YYYY-MM-DD)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by exact NPL UUID',
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

  @ApiPropertyOptional({
    description:
      'Comma-separated purchase_order_product UUIDs to aggregate multiple products',
    example:
      '9acddc64-6248-44fb-a532-f5a849ca3fd1,32beb219-9ee2-43be-a626-e1e75836ff10',
    type: String,
  })
  @IsOptional()
  @Transform(({ value }) => {
    const values = Array.isArray(value) ? value : [value];
    if (values.some((item) => typeof item !== 'string')) return value;

    const ids = values.flatMap((item: string) => item.split(','));
    return ids.map((id) => id.trim()).filter(Boolean);
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(4, { each: true })
  purchaseOrderProductIds?: string[];

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
