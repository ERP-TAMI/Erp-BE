import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  normalizeSizeChartLabels,
  normalizeSizeChartText,
} from './size-chart-dto.transforms';

export class CreateSizeChartDto {
  @ApiProperty({ example: 'Size áo nam', maxLength: 100 })
  @Transform(normalizeSizeChartText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: ['XS', 'S', 'M', 'L', 'XL'], isArray: true })
  @Transform(normalizeSizeChartLabels)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(30, { each: true })
  sizes: string[];
}
