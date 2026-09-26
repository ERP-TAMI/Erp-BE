import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsAbsent } from './create-bom.dto';

export class CreateRevisionDto {
  @ApiProperty({
    description: 'Lý do tạo revision mới (bắt buộc, không được để trống)',
    example: 'Thay đổi định mức kỹ thuật theo giác mẫu sản xuất thực tế',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'reason phải là chuỗi ký tự' })
  @IsNotEmpty({
    message:
      'Lý do tạo revision mới không được để trống hoặc chỉ chứa khoảng trắng',
  })
  reason: string;

  @ApiPropertyOptional({
    description: 'Alias cho reason',
    example: 'Thay đổi định mức kỹ thuật theo giác mẫu sản xuất thực tế',
  })
  @IsOptional()
  @IsString()
  changeReason?: string;

  @IsAbsent({ message: 'sourceRevisionId cannot be provided by client' })
  sourceRevisionId?: any;

  @IsAbsent({ message: 'revisionId cannot be provided by client' })
  revisionId?: any;

  @IsAbsent({ message: 'revisionNo cannot be provided by client' })
  revisionNo?: any;

  @IsAbsent({ message: 'currentRevisionId cannot be provided by client' })
  currentRevisionId?: any;

  @IsAbsent({ message: 'status cannot be provided by client' })
  status?: any;

  @IsAbsent({ message: 'bomId cannot be provided by client' })
  bomId?: any;

  @IsAbsent({ message: 'createdBy cannot be provided by client' })
  createdBy?: any;

  @IsAbsent({ message: 'userId cannot be provided by client' })
  userId?: any;
}
