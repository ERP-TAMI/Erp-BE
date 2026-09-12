import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty({ example: 'SA' })
  roleCode: string;

  @ApiProperty({ example: 'SA / Giám đốc' })
  roleName: string;

  @ApiProperty({ type: [String] })
  permissions: string[];
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;
}
