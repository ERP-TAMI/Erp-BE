import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class QueryEntityHistoryDto {
  @ApiProperty({
    description: 'e.g. StyleOperationStep, StyleDocument, StyleSampleRound',
  })
  @IsString()
  @MaxLength(80)
  aggregateType: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Lịch sử của đúng 1 bản ghi. Bỏ trống nếu dùng parentId.',
  })
  @IsOptional()
  @IsUUID('4')
  aggregateId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Lịch sử của mọi bản ghi con thuộc 1 cha (VD mọi công đoạn của 1 Style). Bỏ trống nếu dùng aggregateId.',
  })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  @ApiPropertyOptional({ description: 'Tìm theo tên bản ghi (targetLabel)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp, inclusive lower bound' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp, inclusive upper bound' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
