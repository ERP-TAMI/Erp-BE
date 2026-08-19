import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateMaterialDto {
  @ApiProperty({ example: 'COTTON-01', maxLength: 50 })
  @Transform(upper)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  materialCode: string;

  @ApiProperty({ example: 'Cotton fabric', maxLength: 255 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  materialName: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Must reference an active material group when creating.',
  })
  @IsOptional()
  @IsUUID('4')
  materialGroupId?: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Must reference an active unit when creating.',
  })
  @IsUUID('4')
  defaultUnitId: string;

  @ApiPropertyOptional({ example: 0, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  defaultYieldPct?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  lastUnitCost?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  currentStock?: number;

  @ApiPropertyOptional({ example: 10, minimum: 0, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  lowStockThreshold?: number;
}
