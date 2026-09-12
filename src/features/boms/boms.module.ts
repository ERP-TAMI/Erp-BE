import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BOMS_ENTITIES } from './entities';
import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';
import { FitBomLine } from '../fit-boms/entities/FitBomLine.entity';
import { FitBomRevision } from '../fit-boms/entities/FitBomRevision.entity';
import { Style } from '../styles/entities/Style.entity';
import { PurchaseOrder } from '../purchase-orders/entities/PurchaseOrder.entity';
import { PurchaseOrderProduct } from '../purchase-orders/entities/PurchaseOrderProduct.entity';
import { PurchaseOrderProductColor } from '../purchase-orders/entities/PurchaseOrderProductColor.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ...BOMS_ENTITIES,
      FitBomLine,
      FitBomRevision,
      Style,
      PurchaseOrder,
      PurchaseOrderProduct,
      PurchaseOrderProductColor,
    ]),
  ],
  controllers: [BomsController],
  providers: [BomsService],
  exports: [BomsService],
})
export class BomsModule {}
