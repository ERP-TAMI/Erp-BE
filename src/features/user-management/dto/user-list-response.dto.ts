import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserAccountStatus } from './user-account-status.enum';

export class UserRoleResponseDto {
  @ApiProperty({ example: 'IT' })
  code: string;

  @ApiProperty({ example: 'Công nghệ thông tin' })
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
