import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  normalizeOptionalStageGroupCode,
  trimNullableStageGroupText,
  trimStageGroupText,
} from './stage-group-dto.transforms';
import { CreateStageGroupItemDto } from './stage-group-item-input.dto';

export class CreateStageGroupDto {
  @ApiPropertyOptional({
    example: 'NS-NHOM-MAY',
    maxLength: 50,
    description:
      'Optional. When omitted, the API generates NS-<normalized group name>.',
  })
  @Transform(normalizeOptionalStageGroupCode)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  groupCode?: string;

  @ApiProperty({ example: 'Nhóm may', maxLength: 255 })
  @Transform(trimStageGroupText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  groupName: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(trimNullableStageGroupText)
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ type: CreateStageGroupItemDto, isArray: true, minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStageGroupItemDto)
  items: CreateStageGroupItemDto[];
}
