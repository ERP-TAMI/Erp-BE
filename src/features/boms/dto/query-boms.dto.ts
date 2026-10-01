import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BomType } from '../../../common/enums/database.enums';

export class QueryBomsDto {
  @ApiPropertyOptional({
    enum: BomType,
    description: 'Filter by NPL type (fit | po)',
  })
  @IsOptional()
  @IsEnum(BomType)
  type?: BomType;

  @ApiPropertyOptional({
    description:
      'Filter by revision status or discontinued (wait_nvkh, wait_rd, wait_tpkh_confirm, wait_accounting, wait_sa_approve, closed, discontinued)',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by exact NPL code' })
  @IsOptional()
  @IsString()
  bomCode?: string;

  @ApiPropertyOptional({ description: 'Filter by style code or style ID' })
  @IsOptional()
  @IsString()
  style?: string;

  @ApiPropertyOptional({ description: 'Filter by PO code or PO ID' })
  @IsOptional()
  @IsString()
  purchaseOrder?: string;

  @ApiPropertyOptional({
    description: 'Filter by product code or purchase_order_product ID',
  })
  @IsOptional()
  @IsString()
  product?: string;

  @ApiPropertyOptional({ description: 'Filter by PO product color name' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({
    description:
      'Free-text search across NPL code, style code/name, PO code, product code/name, and color (matches any one)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by created-at month, in YYYY-MM format',
    example: '2026-09',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'month must be in YYYY-MM format (e.g. 2026-09)',
  })
  month?: string;

  @ApiPropertyOptional({
    description: 'Filter by created-at year (e.g. 2026)',
    example: '2026',
  })
  @IsOptional()
  @IsString()
  year?: string;

  @ApiPropertyOptional({
    description: 'Filter by created-at from date (YYYY-MM-DD)',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by created-at to date (YYYY-MM-DD)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size limit', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Sort field', default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort direction (ASC | DESC)',
    default: 'DESC',
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
