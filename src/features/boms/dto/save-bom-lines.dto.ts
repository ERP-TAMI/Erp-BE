import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsAbsent } from './create-bom.dto';
import { OptionalExpectedRowVersionDto } from './expected-row-version.dto';
import { BomLineResponseDto } from './bom-response.dto';
import { MAX_BULK_LINES } from '../bom-lines-plan';

export class SaveBomLineItemDto {
  @ApiPropertyOptional({
    description: 'UUID dòng đã có. Bỏ trống nếu là dòng mới.',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'lineId must be a valid UUID' })
  lineId?: string;

  @ApiPropertyOptional({
    description: 'Vật tư. Bắt buộc với dòng mới.',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'materialId must be a valid UUID' })
  materialId?: string;

  @ApiPropertyOptional({
    description: 'Định mức tiêu hao (>= 0)',
    example: 1.25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 6 },
    {
      message:
        'consumption must be a valid decimal number with up to 6 decimal places',
    },
  )
  @Min(0, { message: 'consumption must be greater than or equal to 0' })
  consumption?: number;

  @ApiPropertyOptional({ description: 'Ghi chú vật tư' })
  @IsOptional()
  @IsString()
  note?: string | null;

  @IsAbsent({ message: 'unitCost không lưu qua bảng dòng, dùng /lines/costs' })
  unitCost?: any;

  @IsAbsent({ message: 'orderIndex do thứ tự mảng quyết định' })
  orderIndex?: any;
}

export class SaveBomLinesDto extends OptionalExpectedRowVersionDto {
  @ApiProperty({
    description:
      'Toàn bộ bảng dòng mong muốn. Dòng có lineId là sửa, không có là thêm, vắng mặt là xoá; thứ tự mảng là thứ tự dòng.',
    type: [SaveBomLineItemDto],
  })
  @IsArray({ message: 'lines must be an array' })
  @ArrayMaxSize(MAX_BULK_LINES)
  @ValidateNested({ each: true })
  @Type(() => SaveBomLineItemDto)
  lines: SaveBomLineItemDto[];
}

export interface SaveBomLinesResponseDto {
  rowVersion: number;
  lines: BomLineResponseDto[];
}
