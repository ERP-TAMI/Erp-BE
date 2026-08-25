import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { STYLES_ENTITIES } from './entities';
import { StylesService } from './styles.service';
import { StylesController } from './styles.controller';
import { StyleOperationStepsService } from './style-operation-steps.service';
import { StyleOperationStepsController } from './style-operation-steps.controller';

@Module({
  imports: [TypeOrmModule.forFeature(STYLES_ENTITIES)],
  controllers: [StylesController, StyleOperationStepsController],
  providers: [StylesService, StyleOperationStepsService],
  exports: [StylesService, StyleOperationStepsService],
})
export class StylesModule {}

