import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { Unit } from '../../entities/Unit.entity';

export class UnitResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  decimalScale: number;

  @ApiProperty({ enum: RecordStatus })
  status: RecordStatus;

  static fromEntity(unit: Unit): UnitResponseDto {
    return {
      id: unit.id,
      code: unit.code,
      name: unit.name,
      decimalScale: unit.decimalScale,
      status: unit.status,
    };
  }
}
