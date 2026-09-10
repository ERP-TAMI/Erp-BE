import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class ManagementDashboardQueryDto {
  @ApiProperty({
    example: '2026-09',
    pattern: '^(?!0000)\\d{4}-(0[1-9]|1[0-2])$',
  })
  @IsString()
  @Matches(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must use YYYY-MM format',
  })
  month: string;
}
