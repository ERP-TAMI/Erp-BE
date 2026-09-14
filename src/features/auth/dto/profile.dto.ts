import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateMyProfileDto {
  @ApiProperty({ maxLength: 200 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 20 })
  @Transform(({ value }) => {
    if (value == null) return null;
    if (typeof value !== 'string') return value;
    const normalized = value.trim();
    return normalized === '' ? null : normalized;
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[0-9+().\s-]{6,20}$/)
  phone?: string | null;
}

export class ChangeMyPasswordDto {
  @ApiProperty({ minLength: 1, maxLength: 72 })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  currentPassword: string;

  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}
