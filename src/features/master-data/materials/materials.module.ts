import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillOfMaterialLine } from '../../boms/entities/BillOfMaterialLine.entity';
import { DraftBomLine } from '../../draft-boms/entities/DraftBomLine.entity';
import { Material } from '../entities/Material.entity';
import { MaterialGroup } from '../entities/MaterialGroup.entity';
import { MaterialSize } from '../entities/MaterialSize.entity';
import { Unit } from '../entities/Unit.entity';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Material,
      MaterialGroup,
      Unit,
      MaterialSize,
      DraftBomLine,
      BillOfMaterialLine,
    ]),
  ],
  controllers: [MaterialsController],
  providers: [MaterialsService],
})
export class MaterialsModule {}
