import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageController } from './storage.controller';
import { S3StorageService } from './s3-storage.service';
import { STORAGE_SERVICE } from './storage.interface';
import { Style } from '../styles/entities/Style.entity';
import { PurchaseOrder } from '../purchase-orders/entities/PurchaseOrder.entity';
import { PurchaseOrderUploadWriteAccessGuard } from './guards/purchase-order-upload-write-access.guard';
import { PurchaseOrderDownloadAccessGuard } from './guards/purchase-order-download-access.guard';
import { PurchaseOrderFullAccessGuard } from '../../common/guards/purchase-order-full-access.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Style, PurchaseOrder])],
  controllers: [StorageController],
  providers: [
    { provide: STORAGE_SERVICE, useClass: S3StorageService },
    PurchaseOrderUploadWriteAccessGuard,
    PurchaseOrderDownloadAccessGuard,
    PurchaseOrderFullAccessGuard,
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
