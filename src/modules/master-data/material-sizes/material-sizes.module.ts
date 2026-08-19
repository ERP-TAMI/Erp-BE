import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Material } from '../../../features/master-data/entities/Material.entity';
import { MaterialSize } from '../../../features/master-data/entities/MaterialSize.entity';
import { MaterialSizesController } from './material-sizes.controller';
import { MaterialSizeReferenceMap } from './material-size-reference-map';
import { MaterialSizesService } from './material-sizes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Material, MaterialSize])],
  controllers: [MaterialSizesController],
  providers: [MaterialSizesService, MaterialSizeReferenceMap],
})
export class MaterialSizesModule {}
