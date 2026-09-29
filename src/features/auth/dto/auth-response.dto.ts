import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PurchaseOrderMode } from '../../../common/enums/purchase-order-mode.enum';

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  fullName: string;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiProperty({ example: 'SA' })
  roleCode: string;

  @ApiProperty({ example: 'SA / Giám đốc' })
  roleName: string;

  @ApiProperty({ type: [String] })
  permissions: string[];

  @ApiProperty({ enum: PurchaseOrderMode })
  purchaseOrderMode: PurchaseOrderMode;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;
}
