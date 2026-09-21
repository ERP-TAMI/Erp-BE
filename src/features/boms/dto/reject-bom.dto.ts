import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { BomRevisionStatus } from '../../../common/enums/database.enums';
import { IsAbsent } from './create-bom.dto';

export class RejectBomDto {
  @ApiProperty({
    enum: BomRevisionStatus,
    description:
      'Trạng thái muốn trả về (wait_nvkh | wait_rd | wait_tpkh_confirm | wait_accounting)',
    example: BomRevisionStatus.WAIT_NVKH,
  })
  @IsEnum(BomRevisionStatus, {
    message:
      'targetStatus phải là một trong các trạng thái: wait_nvkh, wait_rd, wait_tpkh_confirm, wait_accounting',
  })
  @IsNotEmpty({ message: 'targetStatus là bắt buộc khi từ chối / trả lại BOM' })
  targetStatus: BomRevisionStatus;

  @ApiProperty({
    description: 'Lý do từ chối (bắt buộc, không được để trống)',
    example:
      'Định mức vải chính vượt tiêu chuẩn, đề nghị kiểm tra lại giác mẫu',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'reason phải là chuỗi ký tự' })
  @IsNotEmpty({
    message: 'Lý do từ chối không được để trống hoặc chỉ chứa khoảng trắng',
  })
  reason: string;

  @IsAbsent({ message: 'fromStatus cannot be provided by client' })
  fromStatus?: any;

  @IsAbsent({ message: 'revisionId cannot be provided by client' })
  revisionId?: any;

  @IsAbsent({ message: 'currentRevisionId cannot be provided by client' })
  currentRevisionId?: any;

  @IsAbsent({ message: 'userId cannot be provided by client' })
  userId?: any;
}
