import {
  IsString,
  IsOptional,
  IsUUID,
  IsDateString,
  MaxLength,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';

export class UpdatePurchaseOrderDto {
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Mã PO khách hàng không được vượt quá 100 ký tự' })
  customerPoCode?: string;

  @IsUUID(undefined, { message: 'customerId phải là định dạng UUID hợp lệ' })
  @IsOptional()
  customerId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255, { message: 'Tên khách hàng không được vượt quá 255 ký tự' })
  customerNameSnapshot?: string;

  @IsDateString(
    {},
    { message: 'Ngày nhận (receivedDate) phải là ngày hợp lệ (YYYY-MM-DD)' },
  )
  @IsOptional()
  receivedDate?: string;

  @ValidateIf((_obj, value) => value !== undefined)
  @IsNotEmpty({
    message:
      'Hạn hoàn thành (deadline) không được để trống hoặc mang giá trị null',
  })
  @IsDateString(
    {},
    { message: 'Hạn hoàn thành (deadline) phải là ngày hợp lệ (YYYY-MM-DD)' },
  )
  deadline?: string;

  @IsString()
  @IsOptional()
  note?: string;
}
