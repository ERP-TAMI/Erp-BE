import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillOfMaterialLine } from '../../../../features/boms/entities/BillOfMaterialLine.entity';
import { BillOfMaterials } from '../../../../features/boms/entities/BillOfMaterials.entity';
import { Material } from '../../../../features/master-data/entities/Material.entity';
import { MaterialGroup } from '../../../../features/master-data/entities/MaterialGroup.entity';
import { Unit } from '../../../../features/master-data/entities/Unit.entity';

export type MaterialWithLookups = Material & {
  materialGroup?: MaterialGroup | null;
  defaultUnit?: Unit | null;
};

export type BomLineCreateInput = {
  billOfMaterialId: string;
  materialId: string;
  materialNameSnapshot: string;
  materialGroupSnapshot: string | null;
  unitSnapshot: string;
  consumptionPerUnit: number;
  unitCost: number | null;
  orderIndex: number;
};

@Injectable()
export class BomLinesRepository {
  constructor(
    @InjectRepository(BillOfMaterials)
    private readonly boms: Repository<BillOfMaterials>,
    @InjectRepository(BillOfMaterialLine)
    private readonly lines: Repository<BillOfMaterialLine>,
    @InjectRepository(Material)
    private readonly materials: Repository<Material>,
  ) {}

  bomExists(id: string): Promise<boolean> {
    return this.boms.existsBy({ id });
  }

  list(billOfMaterialId: string): Promise<BillOfMaterialLine[]> {
    return this.lines.find({
      where: { billOfMaterialId },
      order: { orderIndex: 'ASC' },
    });
  }

  findMaterial(id: string): Promise<MaterialWithLookups | null> {
    return this.materials
      .createQueryBuilder('material')
      .leftJoinAndMapOne(
        'material.materialGroup',
        MaterialGroup,
        'materialGroup',
        'materialGroup.id = material.material_group_id',
      )
      .leftJoinAndMapOne(
        'material.defaultUnit',
        Unit,
        'defaultUnit',
        'defaultUnit.id = material.default_unit_id',
      )
      .where('material.id = :id', { id })
      .getOne();
  }

  create(input: BomLineCreateInput): BillOfMaterialLine {
    return this.lines.create({
      ...input,
      materialGroupSnapshot: input.materialGroupSnapshot ?? undefined,
      unitCost: input.unitCost ?? undefined,
    });
  }

  save(line: BillOfMaterialLine): Promise<BillOfMaterialLine> {
    return this.lines.save(line);
  }
}
