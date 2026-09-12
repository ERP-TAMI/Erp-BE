import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BOMS_ENTITIES } from './entities';
import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';
import { DraftBomFamilie } from '../draft-boms/entities/DraftBomFamilie.entity';
import { DraftBomVersion } from '../draft-boms/entities/DraftBomVersion.entity';
import { DraftBomLine } from '../draft-boms/entities/DraftBomLine.entity';
import { Style } from '../styles/entities/Style.entity';
import { PurchaseOrder } from '../purchase-orders/entities/PurchaseOrder.entity';
import { PurchaseOrderProduct } from '../purchase-orders/entities/PurchaseOrderProduct.entity';
import { PurchaseOrderProductColor } from '../purchase-orders/entities/PurchaseOrderProductColor.entity';
import { Material } from '../master-data/entities/Material.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ...BOMS_ENTITIES,
      DraftBomFamilie,
      DraftBomVersion,
      DraftBomLine,
      Style,
      PurchaseOrder,
      PurchaseOrderProduct,
      PurchaseOrderProductColor,
      Material,
    ]),
  ],
  controllers: [BomsController],
  providers: [BomsService],
  exports: [BomsService],
})
export class BomsModule {}
