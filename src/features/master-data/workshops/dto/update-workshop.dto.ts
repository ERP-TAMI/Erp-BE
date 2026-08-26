import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  POSTGRES_INTEGER_MAX,
  rejectNullNumber,
  trimWorkshopText,
} from './workshop-dto.transforms';

export class UpdateWorkshopDto {
  @ApiPropertyOptional({ example: 'Xưởng May Chính', maxLength: 255 })
  @Transform(trimWorkshopText)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    example: 'Nguyễn Văn A',
    maxLength: 200,
    nullable: true,
  })
  @Transform(trimWorkshopText)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  manager?: string | null;

  @ApiPropertyOptional({ example: 'Khu B', maxLength: 255, nullable: true })
  @Transform(trimWorkshopText)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @ApiPropertyOptional({
    example: 700,
    minimum: 0,
    maximum: POSTGRES_INTEGER_MAX,
  })
  @Transform(rejectNullNumber)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(POSTGRES_INTEGER_MAX)
  capacity?: number;
}
