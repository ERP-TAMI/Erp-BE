import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  isStageValueProvided,
  normalizeOptionalStageCode,
  STAGE_SSV_PATTERN,
  trimNullableStageText,
  trimStageText,
} from './stage-dto.transforms';

export class CreateStageDto {
  @ApiPropertyOptional({
    example: 'GD-CAT',
    maxLength: 50,
    description: 'Generated from stageName when omitted',
  })
  @Transform(normalizeOptionalStageCode)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  stageCode?: string;

  @ApiProperty({ example: 'Cắt vải', maxLength: 255 })
  @Transform(trimStageText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  stageName: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(trimNullableStageText)
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ type: String, example: '12.500', default: '0' })
  @Transform(trimStageText)
  @ValidateIf(isStageValueProvided)
  @IsString()
  @Matches(STAGE_SSV_PATTERN)
  ssv?: string;
}
