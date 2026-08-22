import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Material } from '../entities/Material.entity';
import { MaterialGroup } from '../entities/MaterialGroup.entity';
import { MaterialGroupsController } from './material-groups.controller';
import { MaterialGroupsService } from './material-groups.service';

@Module({
  imports: [TypeOrmModule.forFeature([MaterialGroup, Material])],
  controllers: [MaterialGroupsController],
  providers: [MaterialGroupsService],
})
export class MaterialGroupsModule {}
