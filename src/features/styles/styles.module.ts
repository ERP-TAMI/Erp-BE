import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { STYLES_ENTITIES } from './entities';
import { Document } from '../documents/entities/Document.entity';
import { DocumentVersion } from '../documents/entities/DocumentVersion.entity';
import { StorageModule } from '../storage/storage.module';
import { StylesService } from './styles.service';
import { StylesController } from './styles.controller';
import { StyleOperationStepsService } from './style-operation-steps.service';
import { StyleOperationStepsController } from './style-operation-steps.controller';
import { StyleDocumentsService } from './style-documents.service';
import { StyleDocumentsController } from './style-documents.controller';

import { StyleOperationStepsExportService } from './style-operation-steps-export.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([...STYLES_ENTITIES, Document, DocumentVersion]),
    StorageModule,
  ],
  controllers: [
    StylesController,
    StyleOperationStepsController,
    StyleDocumentsController,
  ],
  providers: [
    StylesService,
    StyleOperationStepsService,
    StyleOperationStepsExportService,
    StyleDocumentsService,
  ],
  exports: [
    StylesService,
    StyleOperationStepsService,
    StyleOperationStepsExportService,
  ],
})
export class StylesModule {}
