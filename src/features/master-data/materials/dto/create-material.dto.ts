import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import {
  isProvided,
  MATERIAL_COST_PATTERN,
  MATERIAL_STOCK_PATTERN,
  MATERIAL_YIELD_PATTERN,
  normalizeCode,
  trimText,
} from './material-dto.transforms';

export class CreateMaterialDto {
  @ApiProperty({ example: 'FAB-001', maxLength: 50 })
  @Transform(normalizeCode)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  materialCode: string;

  @ApiProperty({ example: 'Main fabric', maxLength: 255 })
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  materialName: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID('4')
  materialGroupId?: string | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  defaultUnitId: string;

  @ApiPropertyOptional({ type: String, example: '2.5000', default: '0' })
  @Transform(trimText)
  @ValidateIf(isProvided)
  @IsString()
  @Matches(MATERIAL_YIELD_PATTERN)
  defaultYieldPct?: string;

  @ApiPropertyOptional({ type: String, example: '123.45', default: '0' })
  @Transform(trimText)
  @ValidateIf(isProvided)
  @IsString()
  @Matches(MATERIAL_COST_PATTERN)
  lastUnitCost?: string;

  @ApiPropertyOptional({ type: String, example: '30.2500', default: '0' })
  @Transform(trimText)
  @ValidateIf(isProvided)
  @IsString()
  @Matches(MATERIAL_STOCK_PATTERN)
  currentStock?: string;

  @ApiPropertyOptional({ type: String, example: '10.0000', default: '10' })
  @Transform(trimText)
  @ValidateIf(isProvided)
  @IsString()
  @Matches(MATERIAL_STOCK_PATTERN)
  lowStockThreshold?: string;
}
