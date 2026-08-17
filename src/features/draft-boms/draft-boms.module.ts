import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DRAFTBOMS_ENTITIES } from './entities';
import { DraftBomsController } from './draft-boms.controller';
import { DraftBomsService } from './draft-boms.service';

@Module({
  imports: [TypeOrmModule.forFeature(DRAFTBOMS_ENTITIES)],
  controllers: [DraftBomsController],
  providers: [DraftBomsService],
  exports: [DraftBomsService],
})
export class DraftBomsModule {}
