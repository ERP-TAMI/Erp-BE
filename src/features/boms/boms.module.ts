import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BOMS_ENTITIES } from './entities';
import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';

@Module({
  imports: [TypeOrmModule.forFeature(BOMS_ENTITIES)],
  controllers: [BomsController],
  providers: [BomsService],
  exports: [BomsService],
})
export class BomsModule {}
