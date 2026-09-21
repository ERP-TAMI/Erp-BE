import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BomType } from '../../../common/enums/database.enums';

export class QueryBomsDto {
  @ApiPropertyOptional({
    enum: BomType,
    description: 'Filter by BOM type (fit | po)',
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

  @ApiPropertyOptional({
    description: 'Search term across bom_code, style, po, product',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by exact BOM code' })
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
  @Max(200)
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
