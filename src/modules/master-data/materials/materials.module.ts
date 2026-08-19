import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Material } from '../../../features/master-data/entities/Material.entity';
import { MaterialGroup } from '../../../features/master-data/entities/MaterialGroup.entity';
import { MaterialsController } from './controllers/materials.controller';
import { MaterialsRepository } from './repositories/materials.repository';
import { MaterialsService } from './services/materials.service';

@Module({
  imports: [TypeOrmModule.forFeature([Material, MaterialGroup])],
  controllers: [MaterialsController],
  providers: [MaterialsService, MaterialsRepository],
})
export class MaterialsModule {}
