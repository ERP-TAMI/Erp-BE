import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillOfMaterialLine } from '../../../features/boms/entities/BillOfMaterialLine.entity';
import { BillOfMaterials } from '../../../features/boms/entities/BillOfMaterials.entity';
import { Material } from '../../../features/master-data/entities/Material.entity';
import { BomLinesController } from './controllers/bom-lines.controller';
import { BomLinesRepository } from './repositories/bom-lines.repository';
import { BomLinesService } from './services/bom-lines.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BillOfMaterials, BillOfMaterialLine, Material]),
  ],
  controllers: [BomLinesController],
  providers: [BomLinesRepository, BomLinesService],
})
export class BomLinesModule {}
