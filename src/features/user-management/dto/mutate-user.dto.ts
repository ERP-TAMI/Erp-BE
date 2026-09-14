import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRoleCode } from './query-users.dto';
import {
  EDITABLE_USER_ACCOUNT_STATUSES,
  EditableUserAccountStatus,
} from './user-account-status.enum';
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

  @ApiProperty({ enum: EDITABLE_USER_ACCOUNT_STATUSES })
  @IsIn(EDITABLE_USER_ACCOUNT_STATUSES)
  accountStatus: EditableUserAccountStatus;
}

export class CreateUserResponseDto {
  @ApiProperty({ type: UserListItemResponseDto })
  user: UserListItemResponseDto;

  @ApiProperty({ enum: ['pending'] })
  invitationStatus: 'pending';
}

export class InvitationResponseDto {
  @ApiProperty({ enum: ['sent', 'failed'] })
  invitationStatus: 'sent' | 'failed';
}

export class UpdateUserResponseDto {
  @ApiProperty({ type: UserListItemResponseDto })
  user: UserListItemResponseDto;

  @ApiPropertyOptional({ enum: ['pending'], nullable: true })
  invitationStatus: 'pending' | null;
}
