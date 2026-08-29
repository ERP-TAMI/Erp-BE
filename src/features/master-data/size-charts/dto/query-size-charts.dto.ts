import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { normalizeSizeChartText } from './size-chart-dto.transforms';

export class QuerySizeChartsDto {
  @ApiPropertyOptional({ description: 'Search by size chart name' })
  @Transform(normalizeSizeChartText)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: RecordStatus })
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}
