import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '../../../../../common/enums/database.enums';
import { Unit } from '../../../../../features/master-data/entities/Unit.entity';

export class UnitResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: RecordStatus })
  status: RecordStatus;

  static fromEntity(entity: Unit): UnitResponseDto {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      status: entity.status,
    };
  }
}
