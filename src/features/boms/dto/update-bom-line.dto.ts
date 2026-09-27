import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsAbsent } from './create-bom.dto';

export class UpdateBomLineDto {
  @ApiPropertyOptional({
    description: 'Material master UUID mới nếu thay đổi vật tư',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'materialId must be a valid UUID' })
  materialId?: string;

  @ApiPropertyOptional({
    description: 'Định mức tiêu hao vật tư (> 0)',
    example: 1.5,
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
    description:
      'Đơn giá vật tư (chỉ ACCOUNTING được phép sửa; >= 0 hoặc null)',
    example: 45000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 },
    {
      message:
        'unitCost must be a valid decimal number with up to 4 decimal places',
    },
  )
  @Min(0, { message: 'unitCost must be greater than or equal to 0' })
  unitCost?: number | null;

  @ApiPropertyOptional({
    description: 'Ghi chú dòng vật tư',
    example: 'Cập nhật định mức theo bảng giác mẫu mới',
  })
  @IsOptional()
  @IsString()
  note?: string | null;

  // Reject client-injected snapshots and calculated fields
  @IsAbsent({
    message: 'materialNameSnapshot cannot be modified directly by client',
  })
  materialNameSnapshot?: any;

  @IsAbsent({
    message: 'materialGroupSnapshot cannot be modified directly by client',
  })
  materialGroupSnapshot?: any;

  @IsAbsent({ message: 'unitSnapshot cannot be modified directly by client' })
  unitSnapshot?: any;

  @IsAbsent({ message: 'lineCost cannot be modified directly by client' })
  lineCost?: any;

  @IsAbsent({ message: 'id cannot be changed' })
  id?: any;

  @IsAbsent({ message: 'revisionId cannot be changed' })
  revisionId?: any;
}
