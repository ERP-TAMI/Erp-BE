import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';
import {
  STAGE_SSV_PATTERN,
  trimStageText,
} from '../../stages/dto/stage-dto.transforms';

export class StageGroupItemInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  stageId: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  orderIndex: number;

  @ApiPropertyOptional({
    type: String,
    example: '12.500',
    description:
      'Group-specific SSV snapshot. Defaults to the master Stage SSV when omitted.',
  })
  @Transform(trimStageText)
  @IsOptional()
  @IsString()
  @Matches(STAGE_SSV_PATTERN)
  ssv?: string;
}
