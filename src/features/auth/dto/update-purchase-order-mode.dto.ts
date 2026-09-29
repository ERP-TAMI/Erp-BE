import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PurchaseOrderMode } from '../../../common/enums/purchase-order-mode.enum';

export class UpdatePurchaseOrderModeDto {
  @ApiProperty({ enum: PurchaseOrderMode })
  @IsEnum(PurchaseOrderMode)
  mode: PurchaseOrderMode;
}
