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
}
