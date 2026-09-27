import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderBomLineItemDto {
  @ApiProperty({
    description: 'BOM line UUID',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsUUID(undefined, { message: 'lineId must be a valid UUID' })
  @IsNotEmpty({ message: 'lineId is required' })
  lineId: string;

  @ApiProperty({
    description: 'Thứ tự hiển thị mới (>= 0)',
    example: 0,
  })
  @Type(() => Number)
  @IsInt({ message: 'orderIndex must be an integer' })
  @Min(0, { message: 'orderIndex must be greater than or equal to 0' })
  orderIndex: number;
}

export class ReorderBomLinesDto {
  @ApiProperty({
    description: 'Danh sách các dòng cần sắp xếp lại thứ tự',
    type: [ReorderBomLineItemDto],
  })
  @IsArray({ message: 'items must be an array' })
  @ArrayNotEmpty({ message: 'items array cannot be empty' })
  @ValidateNested({ each: true })
  @Type(() => ReorderBomLineItemDto)
  items: ReorderBomLineItemDto[];
}
