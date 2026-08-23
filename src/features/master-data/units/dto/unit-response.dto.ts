import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { Unit } from '../../entities/Unit.entity';

export class UnitResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: RecordStatus })
  status: RecordStatus;

  static fromEntity(unit: Unit): UnitResponseDto {
    return {
      id: unit.id,
      name: unit.name,
      status: unit.status,
    };
  }
}
