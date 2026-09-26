import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

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
