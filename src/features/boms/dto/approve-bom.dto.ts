import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsAbsent } from './create-bom.dto';
import { ExpectedRowVersionDto } from './expected-row-version.dto';

export class ApproveBomDto extends ExpectedRowVersionDto {
  @ApiPropertyOptional({
    description: 'Ghi chú khi phê duyệt (nếu có)',
    example: 'Đồng ý phê duyệt đóng BOM cho sản xuất',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Alias cho reason',
    example: 'Đồng ý phê duyệt',
  })
  @IsOptional()
  @IsString()
  note?: string;

  @IsAbsent({ message: 'status cannot be provided by client' })
  status?: any;

  @IsAbsent({ message: 'fromStatus cannot be provided by client' })
  fromStatus?: any;

  @IsAbsent({ message: 'revisionId cannot be provided by client' })
  revisionId?: any;

  @IsAbsent({ message: 'currentRevisionId cannot be provided by client' })
  currentRevisionId?: any;

  @IsAbsent({ message: 'userId cannot be provided by client' })
  userId?: any;
}
