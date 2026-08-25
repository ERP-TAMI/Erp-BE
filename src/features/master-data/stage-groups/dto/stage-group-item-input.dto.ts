import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { RecordStatus } from '../../../../common/enums/database.enums';
import {
  STAGE_SSV_PATTERN,
  trimStageText,
} from '../../stages/dto/stage-dto.transforms';
import {
  trimNullableStageGroupText,
  trimStageGroupText,
} from './stage-group-dto.transforms';

export class CreateStageGroupItemDto {
  @ApiProperty({ example: 'VS5C sườn', maxLength: 255 })
  @Transform(trimStageGroupText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  itemName: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(trimNullableStageGroupText)
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ type: String, example: '8.500' })
  @Transform(trimStageText)
  @IsString()
  @Matches(STAGE_SSV_PATTERN)
  ssv: string;

  @ApiPropertyOptional({ enum: RecordStatus, default: RecordStatus.ACTIVE })
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  orderIndex: number;
}

export class UpdateStageGroupItemDto extends CreateStageGroupItemDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  id?: string;
}
