import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PURCHASEORDERS_ENTITIES } from './entities';
import { STYLES_ENTITIES } from '../styles/entities';
import { PRODUCTION_ENTITIES } from '../production/entities';
import { Document } from '../documents/entities/Document.entity';
import { DocumentVersion } from '../documents/entities/DocumentVersion.entity';
import { Customer } from '../master-data/entities/Customer.entity';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ...PURCHASEORDERS_ENTITIES,
      ...STYLES_ENTITIES,
      ...PRODUCTION_ENTITIES,
      Document,
      DocumentVersion,
      Customer,
    ]),
  ],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}

