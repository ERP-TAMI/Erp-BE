import { IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBomDto {
  @ApiPropertyOptional({
    description: 'Hạn hoàn thành mẫu / sản xuất',
    example: '2026-10-20T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'deadline must be a valid ISO date string' })
  deadline?: string | null;

  @ApiPropertyOptional({
    description: 'Ghi chú kỹ thuật R&D',
    example: 'Cập nhật định mức chỉ may theo phản hồi của xưởng',
  })
  @IsOptional()
  @IsString()
  rdNote?: string | null;
}
