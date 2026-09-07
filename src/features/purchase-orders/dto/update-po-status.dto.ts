import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PoStatus } from '../../../common/enums/database.enums';

export class UpdatePoStatusDto {
  @IsEnum(PoStatus, { message: 'Trạng thái PO không hợp lệ' })
  @IsNotEmpty({ message: 'Trạng thái PO mới không được để trống' })
  status: PoStatus;

  @IsString()
  @IsOptional()
  reason?: string;
}
