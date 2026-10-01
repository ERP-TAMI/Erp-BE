import { IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PromoteRevisionDto {
  @ApiProperty({
    description: 'Lý do đổi phiên bản hiện hành (bắt buộc)',
    example: 'Phiên bản mới nhất sai định mức, quay về bản đã duyệt trước đó',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'reason phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Lý do không được để trống' })
  reason: string;
}
