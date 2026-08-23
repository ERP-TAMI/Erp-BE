import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { MaterialGroup } from '../../entities/MaterialGroup.entity';

export class MaterialGroupResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: RecordStatus })
  status: RecordStatus;

  static fromEntity(entity: MaterialGroup): MaterialGroupResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      status: entity.status,
    };
  }
}
