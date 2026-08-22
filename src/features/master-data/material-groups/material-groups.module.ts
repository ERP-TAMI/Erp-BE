import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Material } from '../entities/Material.entity';
import { MaterialGroup } from '../entities/MaterialGroup.entity';
import { MaterialGroupsController } from './controllers/material-groups.controller';
import { MaterialGroupsRepository } from './repositories/material-groups.repository';
import { MaterialGroupsService } from './services/material-groups.service';

@Module({
  imports: [TypeOrmModule.forFeature([MaterialGroup, Material])],
  controllers: [MaterialGroupsController],
  providers: [MaterialGroupsService, MaterialGroupsRepository],
})
export class MaterialGroupsModule {}
