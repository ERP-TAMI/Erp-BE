import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { RecordStatus } from '../../../../../common/enums/database.enums';

export class UpdateMaterialGroupStatusDto {
  @ApiProperty({ enum: RecordStatus, example: RecordStatus.INACTIVE })
  @IsEnum(RecordStatus)
  status: RecordStatus;
}
