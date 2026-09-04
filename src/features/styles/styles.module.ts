import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { STYLES_ENTITIES } from './entities';
import { StylesService } from './styles.service';
import { StylesController } from './styles.controller';
import { StyleOperationStepsService } from './style-operation-steps.service';
import { StyleOperationStepsController } from './style-operation-steps.controller';

import { StyleOperationStepsExportService } from './style-operation-steps-export.service';

@Module({
  imports: [TypeOrmModule.forFeature(STYLES_ENTITIES)],
  controllers: [StylesController, StyleOperationStepsController],
  providers: [
    StylesService,
    StyleOperationStepsService,
    StyleOperationStepsExportService,
  ],
  exports: [
    StylesService,
    StyleOperationStepsService,
    StyleOperationStepsExportService,
  ],
})
export class StylesModule {}
