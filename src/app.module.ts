import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { typeOrmConfig } from './database/typeorm.config';
import { AuthModule } from './features/auth/auth.module';
import { MasterDataModule } from './features/master-data/master-data.module';
import { MaterialGroupsModule } from './features/master-data/material-groups/material-groups.module';
import { StagesModule } from './features/master-data/stages/stages.module';
import { StageGroupsModule } from './features/master-data/stage-groups/stage-groups.module';
import { MaterialsModule } from './features/master-data/materials/materials.module';
import { UnitsModule } from './features/master-data/units/units.module';
import { DocumentsModule } from './features/documents/documents.module';
import { StylesModule } from './features/styles/styles.module';
import { DraftBomsModule } from './features/draft-boms/draft-boms.module';
import { PurchaseOrdersModule } from './features/purchase-orders/purchase-orders.module';
import { BomsModule } from './features/boms/boms.module';
import { ProductionModule } from './features/production/production.module';
import { NotificationsModule } from './features/notifications/notifications.module';
import { AuditModule } from './features/audit/audit.module';
import { PlatformModule } from './features/platform/platform.module';
import { AppLoggerModule } from './common/logger/logger.module';

const imports = [
  ConfigModule.forRoot({ isGlobal: true }),
  AppLoggerModule,
  TypeOrmModule.forRootAsync({ useFactory: typeOrmConfig }),
  AuthModule,
  MasterDataModule,
  MaterialGroupsModule,
  StagesModule,
  StageGroupsModule,
  MaterialsModule,
  UnitsModule,
  DocumentsModule,
  StylesModule,
  DraftBomsModule,
  PurchaseOrdersModule,
  BomsModule,
  ProductionModule,
  NotificationsModule,
  AuditModule,
  PlatformModule,
];

@Module({
  imports,
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
