import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
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
import { UpdateStageGroupItemDto } from './stage-group-item-input.dto';

export class UpdateStageGroupDto {
  @ApiPropertyOptional({ example: 'Nhóm may', maxLength: 255 })
  @Transform(trimStageGroupText)
  // IsOptional also skips null, but null must still fail the string validators.
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
    type: UpdateStageGroupItemDto,
    isArray: true,
    minItems: 1,
  })
  // IsOptional also skips null, but null must still fail the array validators.
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateStageGroupItemDto)
  items?: UpdateStageGroupItemDto[];
}
