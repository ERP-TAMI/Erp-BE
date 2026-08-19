import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { RecordStatus } from '../../../../../common/enums/database.enums';

export class UpdateMaterialStatusDto {
  @ApiProperty({ enum: RecordStatus })
  @IsEnum(RecordStatus)
  status: RecordStatus;
}
