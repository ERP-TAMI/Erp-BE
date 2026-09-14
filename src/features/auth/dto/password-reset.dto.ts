import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@tami.vn' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  email: string;
}

export class ValidatePasswordResetDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class CompletePasswordResetDto extends ValidatePasswordResetDto {
  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}

export class PasswordResetAcceptedDto {
  @ApiProperty({ enum: ['pending'] })
  status: 'pending';
}

export class PasswordResetValidationResponseDto {
  @ApiProperty()
  valid: true;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}
