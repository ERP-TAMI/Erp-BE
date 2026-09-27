import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BomType } from '../../../common/enums/database.enums';

export class QueryBomStatsDto {
  @ApiPropertyOptional({
    description: 'Filter stats by month in YYYY-MM format',
    example: '2026-09',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'month must be in YYYY-MM format (e.g. 2026-09)',
  })
  month?: string;

  @ApiPropertyOptional({
    description: 'Filter stats by year (e.g. 2026)',
    example: '2026',
  })
  @IsOptional()
  @IsString()
  year?: string;

  @ApiPropertyOptional({
    description: 'Filter stats from date (YYYY-MM-DD)',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter stats to date (YYYY-MM-DD)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    enum: BomType,
    description: 'Filter stats by BOM type',
  })
  @IsOptional()
  @IsEnum(BomType)
  type?: BomType;
}
