import { IsEnum } from 'class-validator';
import { RecordStatus } from '../../../../../common/enums/database.enums';

export class UpdateMaterialSizeStatusDto {
  @IsEnum(RecordStatus)
  status: RecordStatus;
}
