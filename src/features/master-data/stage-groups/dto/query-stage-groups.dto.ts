import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { trimStageGroupText } from './stage-group-dto.transforms';

export class QueryStageGroupsDto {
  @ApiPropertyOptional({ description: 'Search by group code or name' })
  @Transform(trimStageGroupText)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ enum: RecordStatus })
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}
