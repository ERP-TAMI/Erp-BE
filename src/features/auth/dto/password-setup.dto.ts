import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ValidatePasswordSetupDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class CompletePasswordSetupDto extends ValidatePasswordSetupDto {
  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}

export class PasswordSetupValidationResponseDto {
  @ApiProperty()
  valid: true;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}
