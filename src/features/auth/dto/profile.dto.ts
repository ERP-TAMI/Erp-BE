import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateBy,
} from 'class-validator';

const isProfilePhone = (value: unknown): boolean => {
  if (typeof value !== 'string' || !/^\+?[0-9().\s-]+$/.test(value)) {
    return false;
  }

  const digits = value.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15 && !/^(\d)\1+$/.test(digits);
};

const IsProfilePhone = () =>
  ValidateBy({
    name: 'isProfilePhone',
    validator: {
      validate: isProfilePhone,
      defaultMessage: () => 'phone must be a valid phone number',
    },
  });

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
  @IsProfilePhone()
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
