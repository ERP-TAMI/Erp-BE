import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { trimWorkshopText } from './workshop-dto.transforms';

export class QueryWorkshopsDto {
  @ApiPropertyOptional({
    description: 'Search by workshop code, name or manager',
  })
  @Transform(trimWorkshopText)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ enum: RecordStatus })
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}
