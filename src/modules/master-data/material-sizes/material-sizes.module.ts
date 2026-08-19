import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Material } from '../../../features/master-data/entities/Material.entity';
import { MaterialSize } from '../../../features/master-data/entities/MaterialSize.entity';
import { MaterialSizesController } from './controllers/material-sizes.controller';
import { MaterialSizeReferenceMap } from './repositories/material-size-reference-map';
import { MaterialSizesRepository } from './repositories/material-sizes.repository';
import { MaterialSizesService } from './services/material-sizes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Material, MaterialSize])],
  controllers: [MaterialSizesController],
  providers: [
    MaterialSizesService,
    MaterialSizesRepository,
    MaterialSizeReferenceMap,
  ],
})
export class MaterialSizesModule {}
