import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { Material } from '../../entities/Material.entity';
import { MaterialGroup } from '../../entities/MaterialGroup.entity';
import { Unit } from '../../entities/Unit.entity';

export class MaterialResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  materialCode: string;

  @ApiProperty()
  materialName: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  materialGroupId: string | null;

  @ApiProperty({ nullable: true })
  materialGroupName: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  defaultUnitId: string | null;

  @ApiProperty({ nullable: true })
  defaultUnitName: string | null;

  @ApiProperty({ type: String, example: '2.5000' })
  defaultYieldPct: string;

  @ApiProperty({ enum: RecordStatus })
  status: RecordStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static fromEntities(
    material: Material,
    materialGroup: MaterialGroup | null,
    defaultUnit: Unit | null,
  ): MaterialResponseDto {
    return {
      id: material.id,
      materialCode: material.materialCode,
      materialName: material.materialName,
      materialGroupId: material.materialGroupId ?? null,
      materialGroupName: materialGroup?.name ?? null,
      defaultUnitId: material.defaultUnitId ?? null,
      defaultUnitName: defaultUnit?.name ?? null,
      defaultYieldPct: String(material.defaultYieldPct),
      status: material.status,
      createdAt: material.createdAt,
      updatedAt: material.updatedAt,
    };
  }
}
