import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsDateString,
  MaxLength,
} from 'class-validator';

export class CreatePurchaseOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'Mã PO (poCode) không được để trống' })
  @MaxLength(50, { message: 'Mã PO không được vượt quá 50 ký tự' })
  poCode: string;

  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Mã PO khách hàng không được vượt quá 100 ký tự' })
  customerPoCode?: string;

  @IsUUID('4', { message: 'customerId phải là định dạng UUID hợp lệ' })
  @IsNotEmpty({ message: 'Khách hàng (customerId) không được để trống' })
  customerId: string;

  @IsString()
  @IsNotEmpty({ message: 'Tên khách hàng không được để trống' })
  @MaxLength(255, { message: 'Tên khách hàng không được vượt quá 255 ký tự' })
  customerNameSnapshot: string;

  @IsDateString(
    {},
    { message: 'Ngày nhận (receivedDate) phải là ngày hợp lệ (YYYY-MM-DD)' },
  )
  @IsNotEmpty({ message: 'Ngày nhận không được để trống' })
  receivedDate: string;

  @IsString()
  @IsOptional()
  note?: string;
}
