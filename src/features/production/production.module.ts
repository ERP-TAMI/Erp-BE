import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PRODUCTION_ENTITIES } from './entities';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';

@Module({
  imports: [TypeOrmModule.forFeature(PRODUCTION_ENTITIES)],
  controllers: [ProductionController],
  providers: [ProductionService],
  exports: [ProductionService],
})
export class ProductionModule {}
