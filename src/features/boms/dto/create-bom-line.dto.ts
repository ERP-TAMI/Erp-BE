import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsAbsent } from './create-bom.dto';

export class CreateBomLineDto {
  @ApiProperty({
    description: 'Material master UUID',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsUUID(undefined, { message: 'materialId must be a valid UUID' })
  @IsNotEmpty({ message: 'materialId is required' })
  materialId: string;

  @ApiPropertyOptional({
    description: 'Định mức tiêu hao vật tư (phải là số thực không âm >= 0, mặc định 0)',
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

  @ApiPropertyOptional({
    description: 'Ghi chú vật tư',
    example: 'Dùng cho thân trước và tay áo',
  })
  @IsOptional()
  @IsString()
  note?: string | null;

  @ApiPropertyOptional({
    description:
      'Thứ tự hiển thị (>= 0). Nếu không truyền, hệ thống tự xếp cuối.',
    example: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'orderIndex must be an integer' })
  @Min(0, { message: 'orderIndex must be greater than or equal to 0' })
  orderIndex?: number;

  // Reject client-injected snapshots and calculated fields
  @IsAbsent({ message: 'materialNameSnapshot cannot be provided by client' })
  materialNameSnapshot?: any;

  @IsAbsent({ message: 'materialGroupSnapshot cannot be provided by client' })
  materialGroupSnapshot?: any;

  @IsAbsent({ message: 'unitSnapshot cannot be provided by client' })
  unitSnapshot?: any;

  @IsAbsent({ message: 'unitCost cannot be set during line creation' })
  unitCost?: any;

  @IsAbsent({ message: 'lineCost cannot be provided by client' })
  lineCost?: any;
}
