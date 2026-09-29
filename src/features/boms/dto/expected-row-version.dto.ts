import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export abstract class ExpectedRowVersionDto {
  @ApiProperty({
    description: 'Row version đọc từ BOM detail gần nhất',
    example: 3,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'expectedRowVersion phải là số nguyên' })
  @Min(1, { message: 'expectedRowVersion phải lớn hơn hoặc bằng 1' })
  expectedRowVersion: number;
}

/**
 * Same optimistic-lock field, but optional — for write endpoints that can be
 * called as part of a batch (multiple lines saved in quick succession, e.g.
 * RD/Accounting bulk line entry) where the client cannot reliably predict the
 * row version of an in-flight batch member. When provided, the server still
 * enforces it (409 on mismatch); when omitted, the check is skipped.
 */
export abstract class OptionalExpectedRowVersionDto {
  @ApiPropertyOptional({
    description:
      'Row version đọc từ BOM detail gần nhất (tùy chọn — bỏ qua nếu gọi hàng loạt nhiều dòng liên tiếp). Nếu có, server sẽ kiểm tra và trả 409 khi lệch.',
    example: 3,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'expectedRowVersion phải là số nguyên' })
  @Min(1, { message: 'expectedRowVersion phải lớn hơn hoặc bằng 1' })
  expectedRowVersion?: number;
}
