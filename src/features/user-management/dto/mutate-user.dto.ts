import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRoleCode } from './query-users.dto';
import { UserAccountStatus } from './user-account-status.enum';
import { UserListItemResponseDto } from './user-list-response.dto';

export class MutateUserDto {
  @ApiProperty({ maxLength: 200 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName: string;

  @ApiProperty({ format: 'email', maxLength: 255 })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 20 })
  @Transform(({ value }) => {
    if (value == null) return null;
    return typeof value === 'string' && value.trim() === ''
      ? null
      : value.trim();
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[0-9+().\s-]{6,20}$/)
  phone: string | null = null;

  @ApiProperty({ enum: UserRoleCode })
  @IsEnum(UserRoleCode)
  roleCode: UserRoleCode;

  @ApiProperty({ enum: UserAccountStatus })
  @IsEnum(UserAccountStatus)
  accountStatus: UserAccountStatus;
}

export class CreateUserResponseDto {
  @ApiProperty({ type: UserListItemResponseDto })
  user: UserListItemResponseDto;

  @ApiProperty({ enum: ['sent', 'failed'] })
  invitationStatus: 'sent' | 'failed';
}

export class InvitationResponseDto {
  @ApiProperty({ enum: ['sent', 'failed'] })
  invitationStatus: 'sent' | 'failed';
}

export class UpdateUserResponseDto {
  @ApiProperty({ type: UserListItemResponseDto })
  user: UserListItemResponseDto;

  @ApiPropertyOptional({ enum: ['sent', 'failed'], nullable: true })
  invitationStatus: 'sent' | 'failed' | null;
}
