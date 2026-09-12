import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRevisionDto {
  @ApiPropertyOptional({
    description:
      'ID của revision nguồn cần sao chép (clone lines). Nếu để trống, sẽ tự động clone từ Active Approved Revision hiện tại.',
  })
  @IsOptional()
  @IsUUID()
  cloneFromRevisionId?: string;

  @ApiPropertyOptional({
    description: 'Lý do tạo revision mới hoặc mô tả thay đổi',
  })
  @IsOptional()
  @IsString()
  changeReason?: string;

  @ApiPropertyOptional({
    description:
      'ID của Fit BOM Revision nguồn (dành cho PO BOM khi liên kết mẫu Fit)',
  })
  @IsOptional()
  @IsUUID()
  sourceFitBomRevisionId?: string;
}
