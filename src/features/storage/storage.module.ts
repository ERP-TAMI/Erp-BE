import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageController } from './storage.controller';
import { S3StorageService } from './s3-storage.service';
import { STORAGE_SERVICE } from './storage.interface';
import { Style } from '../styles/entities/Style.entity';
import { PurchaseOrder } from '../purchase-orders/entities/PurchaseOrder.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Style, PurchaseOrder])],
  controllers: [StorageController],
  providers: [{ provide: STORAGE_SERVICE, useClass: S3StorageService }],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
