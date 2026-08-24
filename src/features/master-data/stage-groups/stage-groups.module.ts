import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Stage } from '../entities/Stage.entity';
import { StageGroup } from '../entities/StageGroup.entity';
import { StageGroupItem } from '../entities/StageGroupItem.entity';
import { StageGroupsController } from './stage-groups.controller';
import { StageGroupsService } from './stage-groups.service';

@Module({
  imports: [TypeOrmModule.forFeature([StageGroup, StageGroupItem, Stage])],
  controllers: [StageGroupsController],
  providers: [StageGroupsService],
})
export class StageGroupsModule {}
