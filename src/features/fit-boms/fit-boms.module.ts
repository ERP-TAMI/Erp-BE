import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FITBOMS_ENTITIES } from './entities';
import { FitBomsController } from './fit-boms.controller';
import { FitBomsService } from './fit-boms.service';

@Module({
  imports: [TypeOrmModule.forFeature(FITBOMS_ENTITIES)],
  controllers: [FitBomsController],
  providers: [FitBomsService],
  exports: [FitBomsService],
})
export class FitBomsModule {}
