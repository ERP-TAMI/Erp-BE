import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BOMS_ENTITIES } from './entities';
import { Style } from '../styles/entities/Style.entity';
import { PurchaseOrderProduct } from '../purchase-orders/entities/PurchaseOrderProduct.entity';
import { PurchaseOrder } from '../purchase-orders/entities/PurchaseOrder.entity';
import { PurchaseOrderProductColor } from '../purchase-orders/entities/PurchaseOrderProductColor.entity';
import { PurchaseOrderProductColorSize } from '../purchase-orders/entities/PurchaseOrderProductColorSize.entity';
import { Material } from '../master-data/entities/Material.entity';
import { MaterialGroup } from '../master-data/entities/MaterialGroup.entity';
import { Unit } from '../master-data/entities/Unit.entity';
import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';
import { BomCostService } from './bom-cost.service';
import { BomAggregateService } from './bom-aggregate.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ...BOMS_ENTITIES,
      Style,
      PurchaseOrderProduct,
      PurchaseOrder,
      PurchaseOrderProductColor,
      PurchaseOrderProductColorSize,
      Material,
      MaterialGroup,
      Unit,
    ]),
  ],
  controllers: [BomsController],
  providers: [BomsService, BomCostService, BomAggregateService],
  exports: [BomsService, BomCostService, BomAggregateService],
})
export class BomsModule {}
