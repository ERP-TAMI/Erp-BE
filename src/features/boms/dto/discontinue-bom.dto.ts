import { IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ExpectedRowVersionDto } from './expected-row-version.dto';

export class DiscontinueBomDto extends ExpectedRowVersionDto {
  @ApiProperty({
    description: 'Lý do ngừng sử dụng BOM (bắt buộc, không được để trống)',
    example: 'Khách hàng thay đổi thiết kế mẫu hoàn toàn',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Lý do ngừng sử dụng phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Lý do ngừng sử dụng không được để trống' })
  reason: string;
}
