import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '../../../../../common/enums/database.enums';
import { Material } from '../../../../../features/master-data/entities/Material.entity';

export class MaterialResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() materialCode: string;
  @ApiProperty() materialName: string;
  @ApiProperty({ format: 'uuid' }) materialGroupId: string;
  @ApiProperty({ enum: RecordStatus }) status: RecordStatus;

  static fromEntity(material: Material): MaterialResponseDto {
    return {
      id: material.id,
      materialCode: material.materialCode,
      materialName: material.materialName,
      materialGroupId: material.materialGroupId,
      status: material.status,
    };
  }
}
