import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { OptionalExpectedRowVersionDto } from './expected-row-version.dto';
import { MAX_BULK_LINES } from '../bom-lines-plan';

export class SaveBomCostItemDto {
  @ApiProperty({ description: 'UUID dòng vật tư' })
  @IsUUID(undefined, { message: 'lineId must be a valid UUID' })
  lineId: string;

  @ApiProperty({
    description: 'Đơn giá (>= 0) hoặc null để xoá giá',
    nullable: true,
    example: 12500,
  })
  @ValidateIf((_obj, value) => value !== null)
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 },
    { message: 'unitCost must be a number with up to 4 decimal places' },
  )
  @Min(0, { message: 'unitCost must be greater than or equal to 0' })
  unitCost: number | null;
}

export class SaveBomCostsDto extends OptionalExpectedRowVersionDto {
  @ApiProperty({ type: [SaveBomCostItemDto] })
  @IsArray({ message: 'items must be an array' })
  @ArrayNotEmpty({ message: 'items array cannot be empty' })
  @ArrayMaxSize(MAX_BULK_LINES)
  @ValidateNested({ each: true })
  @Type(() => SaveBomCostItemDto)
  items: SaveBomCostItemDto[];
}
