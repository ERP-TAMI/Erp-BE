import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { StyleStatus } from '../../../common/enums/database.enums';

export class CreateStyleDto {
  @IsString()
  @IsNotEmpty({ message: 'Mã mẫu Fit (styleCode) không được để trống' })
  @MaxLength(100, { message: 'Mã mẫu Fit không được vượt quá 100 ký tự' })
  styleCode: string;

  @IsString()
  @IsNotEmpty({ message: 'Tên mẫu Fit (styleName) không được để trống' })
  @MaxLength(255, { message: 'Tên mẫu Fit không được vượt quá 255 ký tự' })
  styleName: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Danh mục không được vượt quá 100 ký tự' })
  category?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'baseImageVersionId không được vượt quá 500 ký tự' })
  baseImageVersionId?: string;

  @IsEnum(StyleStatus)
  @IsOptional()
  status?: StyleStatus;
}
