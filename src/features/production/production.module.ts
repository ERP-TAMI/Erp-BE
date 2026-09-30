import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PRODUCTION_ENTITIES } from './entities';
import { Style } from '../styles/entities/Style.entity';
import { StyleDocument } from '../styles/entities/StyleDocument.entity';
import { Document } from '../documents/entities/Document.entity';
import { Bom } from '../boms/entities/Bom.entity';
import { BomLine } from '../boms/entities/BomLine.entity';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';
import { StyleProductionDocsController } from './style-production-docs.controller';
import { StyleProductionDocsService } from './style-production-docs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ...PRODUCTION_ENTITIES,
      Style,
      StyleDocument,
      Document,
      Bom,
      BomLine,
    ]),
    StorageModule,
    AuditModule,
  ],
  controllers: [ProductionController, StyleProductionDocsController],
  providers: [ProductionService, StyleProductionDocsService],
  exports: [ProductionService, StyleProductionDocsService],
})
export class ProductionModule {}
