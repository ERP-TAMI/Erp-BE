import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserAccountStatus } from './user-account-status.enum';
import { PasswordSetupEmailStatus } from '../../auth/password-setup-email-status.enum';

export class UserRoleResponseDto {
  @ApiProperty({ example: 'IT' })
  code: string;

  @ApiProperty({ example: 'IT' })
  name: string;
}

export class UserListItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ type: UserRoleResponseDto, nullable: true })
  role: UserRoleResponseDto | null;

  @ApiProperty({ enum: UserAccountStatus })
  accountStatus: UserAccountStatus;

  @ApiProperty()
  passwordSetupRequired: boolean;

  @ApiPropertyOptional({ enum: PasswordSetupEmailStatus, nullable: true })
  passwordSetupEmailStatus: PasswordSetupEmailStatus | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  passwordSetupEmailAttemptedAt: string | null;
}

export class UserListMetaResponseDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

export class UserListResponseDto {
  @ApiProperty({ type: UserListItemResponseDto, isArray: true })
  data: UserListItemResponseDto[];

  @ApiProperty({ type: UserListMetaResponseDto })
  meta: UserListMetaResponseDto;
}
