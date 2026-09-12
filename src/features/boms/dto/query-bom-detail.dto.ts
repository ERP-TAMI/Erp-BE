import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryBomDetailDto {
  @ApiPropertyOptional({
    description: 'Lấy theo ID của Revision cụ thể (kể cả draft/in_review)',
  })
  @IsOptional()
  @IsUUID()
  revisionId?: string;

  @ApiPropertyOptional({
    description: 'Lấy theo số revision (revision_no)',
  })
  @IsOptional()
  @IsString()
  revisionNo?: string;

  @ApiPropertyOptional({
    description:
      'Ngày hiệu lực cần lấy (YYYY-MM-DD), mặc định là ngày hiện tại',
  })
  @IsOptional()
  @IsString()
  targetDate?: string;

  @ApiPropertyOptional({
    description: 'Lấy revision draft/in_review mới nhất cho màn hình nhập liệu',
  })
  @IsOptional()
  editable?: boolean | string;
}
