import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExpectedRowVersionDto } from './expected-row-version.dto';

export class ForwardBomDto extends ExpectedRowVersionDto {
  @ApiPropertyOptional({
    description: 'Ghi chú khi chuyển bước tiếp theo (nếu có)',
    example: 'Đã hoàn thiện định mức kỹ thuật vải chính và phụ liệu',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Alias cho reason',
    example: 'Đã hoàn thiện định mức kỹ thuật',
  })
  @IsOptional()
  @IsString()
  note?: string;
}
