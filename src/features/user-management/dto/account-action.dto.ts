import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EDITABLE_USER_ACCOUNT_STATUSES,
  EditableUserAccountStatus,
  UserAccountStatus,
} from './user-account-status.enum';
import { UserListItemResponseDto } from './user-list-response.dto';

const trimOptionalText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class AccountStatusActionDto {
  @ApiProperty({ enum: EDITABLE_USER_ACCOUNT_STATUSES })
  @IsIn(EDITABLE_USER_ACCOUNT_STATUSES)
  accountStatus: EditableUserAccountStatus;

  @ApiPropertyOptional({ maxLength: 500 })
  @Transform(trimOptionalText)
  @ValidateIf(
    (dto: AccountStatusActionDto) =>
      dto.accountStatus === UserAccountStatus.LOCKED ||
      dto.reason !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}

export class AccountStatusActionResponseDto {
  @ApiProperty({ type: UserListItemResponseDto })
  user: UserListItemResponseDto;
}

export class SetTemporaryPasswordDto {
  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(72)
  temporaryPassword: string;
}

export class PasswordResetResponseDto {
  @ApiProperty({ type: UserListItemResponseDto })
  user: UserListItemResponseDto;

  @ApiProperty({ enum: ['sent', 'failed'] })
  temporaryPasswordEmailStatus: 'sent' | 'failed';
}
