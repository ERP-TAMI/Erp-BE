import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Material } from '../../../features/master-data/entities/Material.entity';
import { MaterialGroup } from '../../../features/master-data/entities/MaterialGroup.entity';
import { Unit } from '../../../features/master-data/entities/Unit.entity';
import { BillOfMaterialLine } from '../../../features/boms/entities/BillOfMaterialLine.entity';
import { DraftBomLine } from '../../../features/draft-boms/entities/DraftBomLine.entity';
import { MaterialSize } from '../../../features/master-data/entities/MaterialSize.entity';
import { MaterialsController } from './controllers/materials.controller';
import { MaterialsRepository } from './repositories/materials.repository';
import { MaterialsService } from './services/materials.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Material,
      MaterialGroup,
      Unit,
      BillOfMaterialLine,
      DraftBomLine,
      MaterialSize,
    ]),
  ],
  controllers: [MaterialsController],
  providers: [MaterialsService, MaterialsRepository],
})
export class MaterialsModule {}
