import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  trimNullableStageGroupText,
  trimStageGroupText,
} from './stage-group-dto.transforms';
import { StageGroupItemInputDto } from './stage-group-item-input.dto';

export class UpdateStageGroupDto {
  @ApiPropertyOptional({ example: 'Nhóm may', maxLength: 255 })
  @Transform(trimStageGroupText)
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  groupName?: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(trimNullableStageGroupText)
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({
    type: StageGroupItemInputDto,
    isArray: true,
    minItems: 1,
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((item: StageGroupItemInputDto) => item.stageId)
  @ValidateNested({ each: true })
  @Type(() => StageGroupItemInputDto)
  items?: StageGroupItemInputDto[];
}
