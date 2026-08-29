import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StageGroup } from '../entities/StageGroup.entity';
import { StageGroupItem } from '../entities/StageGroupItem.entity';
import { StageGroupsController } from './stage-groups.controller';
import { StageGroupsService } from './stage-groups.service';

@Module({
  imports: [TypeOrmModule.forFeature([StageGroup, StageGroupItem])],
  controllers: [StageGroupsController],
  providers: [StageGroupsService],
})
export class StageGroupsModule {}
