import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveRevisionDto {
  @ApiProperty({
    description:
      'Ngày bắt đầu có hiệu lực (YYYY-MM-DD), bắt buộc khi duyệt Revision >= 2',
    example: '2026-04-01',
  })
  @IsNotEmpty({
    message: 'Ngày effectiveFrom không được để trống khi phê duyệt Revision.',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'effectiveFrom phải đúng định dạng YYYY-MM-DD.',
  })
  effectiveFrom: string;

  @ApiPropertyOptional({
    description: 'Row version mong muốn (kiểm tra optimistic locking)',
  })
  @IsOptional()
  @IsNumber()
  expectedRowVersion?: number;
}
