import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  normalizeWorkshopCode,
  POSTGRES_INTEGER_MAX,
  rejectNullNumber,
  trimWorkshopText,
} from './workshop-dto.transforms';

export class CreateWorkshopDto {
  @ApiProperty({ example: 'X-01', maxLength: 50 })
  @Transform(normalizeWorkshopCode)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  workshopCode: string;

  @ApiProperty({ example: 'Xưởng May 1', maxLength: 255 })
  @Transform(trimWorkshopText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

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

  @ApiPropertyOptional({ example: 'Khu A', maxLength: 255, nullable: true })
  @Transform(trimWorkshopText)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @ApiPropertyOptional({
    example: 500,
    minimum: 0,
    maximum: POSTGRES_INTEGER_MAX,
    default: 0,
  })
  @Transform(rejectNullNumber)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(POSTGRES_INTEGER_MAX)
  capacity?: number;
}
