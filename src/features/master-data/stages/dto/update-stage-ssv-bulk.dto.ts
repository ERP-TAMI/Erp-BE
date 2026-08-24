import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { STAGE_SSV_PATTERN, trimStageText } from './stage-dto.transforms';

export class StageSsvUpdateDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  id: string;

  @ApiProperty({ type: String, example: '12.500' })
  @Transform(trimStageText)
  @IsString()
  @Matches(STAGE_SSV_PATTERN)
  ssv: string;
}

export class UpdateStageSsvBulkDto {
  @ApiProperty({ type: StageSsvUpdateDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((item: StageSsvUpdateDto) => item.id)
  @ValidateNested({ each: true })
  @Type(() => StageSsvUpdateDto)
  items: StageSsvUpdateDto[];
}
