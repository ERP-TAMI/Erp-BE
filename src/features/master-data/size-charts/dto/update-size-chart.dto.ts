import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  normalizeSizeChartLabels,
  normalizeSizeChartText,
} from './size-chart-dto.transforms';

export class UpdateSizeChartDto {
  @ApiPropertyOptional({ example: 'Size áo nam chuẩn', maxLength: 100 })
  @Transform(normalizeSizeChartText)
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: ['XS', 'S', 'M', 'L', 'XL'], isArray: true })
  @Transform(normalizeSizeChartLabels)
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(30, { each: true })
  sizes?: string[];
}
