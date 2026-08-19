import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '../../../../../common/enums/database.enums';
import { MaterialGroup } from '../../../../../features/master-data/entities/MaterialGroup.entity';

export class MaterialGroupResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  displayOrder: number;

  @ApiProperty({ enum: RecordStatus })
  status: RecordStatus;

  static fromEntity(entity: MaterialGroup): MaterialGroupResponseDto {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      displayOrder: entity.displayOrder,
      status: entity.status,
    };
  }
}
