import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '../../../../../common/enums/database.enums';
import { Material } from '../../../../../features/master-data/entities/Material.entity';
import { MaterialGroup } from '../../../../../features/master-data/entities/MaterialGroup.entity';
import { Unit } from '../../../../../features/master-data/entities/Unit.entity';

class MaterialGroupSnapshotDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
}

class UnitSnapshotDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
}

type MaterialWithLookups = Material & {
  materialGroup?: MaterialGroup;
  defaultUnit?: Unit;
};

export class MaterialResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() materialCode: string;
  @ApiProperty() materialName: string;
  @ApiProperty({ format: 'uuid', nullable: true }) materialGroupId:
    string | null;
  @ApiProperty({ format: 'uuid' }) defaultUnitId: string;
  @ApiProperty() defaultYieldPct: number;
  @ApiProperty() lastUnitCost: number;
  @ApiProperty() currentStock: number;
  @ApiProperty() lowStockThreshold: number;
  @ApiProperty({ type: MaterialGroupSnapshotDto, nullable: true })
  materialGroup: MaterialGroupSnapshotDto | null;
  @ApiProperty({ type: UnitSnapshotDto, nullable: true })
  defaultUnit: UnitSnapshotDto | null;
  @ApiProperty({ enum: RecordStatus }) status: RecordStatus;

  static fromEntity(material: Material): MaterialResponseDto {
    const lookupMaterial = material as MaterialWithLookups;
    return {
      id: material.id,
      materialCode: material.materialCode,
      materialName: material.materialName,
      materialGroupId: material.materialGroupId,
      defaultUnitId: material.defaultUnitId,
      defaultYieldPct: Number(material.defaultYieldPct),
      lastUnitCost: Number(material.lastUnitCost),
      currentStock: Number(material.currentStock),
      lowStockThreshold: Number(material.lowStockThreshold),
      materialGroup: lookupMaterial.materialGroup
        ? {
            id: lookupMaterial.materialGroup.id,
            code: lookupMaterial.materialGroup.code,
            name: lookupMaterial.materialGroup.name,
          }
        : null,
      defaultUnit: lookupMaterial.defaultUnit
        ? {
            id: lookupMaterial.defaultUnit.id,
            code: lookupMaterial.defaultUnit.code,
            name: lookupMaterial.defaultUnit.name,
          }
        : null,
      status: material.status,
    };
  }
}
