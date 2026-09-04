import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PRODUCTION_ENTITIES } from './entities';
import { Style } from '../styles/entities/Style.entity';
import { StyleDocument } from '../styles/entities/StyleDocument.entity';
import { Document } from '../documents/entities/Document.entity';
import { BillOfMaterials } from '../boms/entities/BillOfMaterials.entity';
import { BillOfMaterialLine } from '../boms/entities/BillOfMaterialLine.entity';
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
      BillOfMaterials,
      BillOfMaterialLine,
    ]),
  ],
  controllers: [ProductionController, StyleProductionDocsController],
  providers: [ProductionService, StyleProductionDocsService],
  exports: [ProductionService, StyleProductionDocsService],
})
export class ProductionModule {}
