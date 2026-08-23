import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { trimStageText } from './stage-dto.transforms';

export class QueryStagesDto {
  @ApiPropertyOptional({ description: 'Search by stage code or name' })
  @Transform(trimStageText)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ enum: RecordStatus })
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}
