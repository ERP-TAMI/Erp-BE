import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { RecordStatus } from '../../../../common/enums/database.enums';

export class UpdateWorkshopStatusDto {
  @ApiProperty({ enum: RecordStatus, example: RecordStatus.INACTIVE })
  @IsEnum(RecordStatus)
  status: RecordStatus;
}
