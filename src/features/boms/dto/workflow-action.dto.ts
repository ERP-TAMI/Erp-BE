import { IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class WorkflowActionDto {
  @ApiPropertyOptional({
    description: 'Lý do thực hiện hành động (bắt buộc khi Reject hoặc Cancel)',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Row version mong muốn (kiểm tra optimistic locking)',
  })
  @IsOptional()
  @IsNumber()
  expectedRowVersion?: number;
}
