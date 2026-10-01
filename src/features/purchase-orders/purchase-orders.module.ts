import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PURCHASEORDERS_ENTITIES } from './entities';
import { STYLES_ENTITIES } from '../styles/entities';
import { PRODUCTION_ENTITIES } from '../production/entities';
import { Document } from '../documents/entities/Document.entity';
import { DocumentVersion } from '../documents/entities/DocumentVersion.entity';
import { Customer } from '../master-data/entities/Customer.entity';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrderWriteAccessGuard } from './guards/purchase-order-write-access.guard';
import { PurchaseOrderFullAccessGuard } from '../../common/guards/purchase-order-full-access.guard';
import { PurchaseOrderProductStatusGuard } from './guards/purchase-order-product-status.guard';

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
    StorageModule,
    AuditModule,
  ],
  controllers: [PurchaseOrdersController],
  providers: [
    PurchaseOrdersService,
    PurchaseOrderWriteAccessGuard,
    PurchaseOrderFullAccessGuard,
    PurchaseOrderProductStatusGuard,
  ],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
