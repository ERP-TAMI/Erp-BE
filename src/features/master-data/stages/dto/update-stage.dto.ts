import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { CreateStageDto } from './create-stage.dto';
import {
  isStageValueProvided,
  normalizeStageCode,
} from './stage-dto.transforms';

export class UpdateStageDto extends PartialType(
  OmitType(CreateStageDto, ['stageCode'] as const),
) {
  @ApiPropertyOptional({ example: 'GD-CAT', maxLength: 50 })
  @Transform(normalizeStageCode)
  @ValidateIf(isStageValueProvided)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  stageCode?: string;
}
