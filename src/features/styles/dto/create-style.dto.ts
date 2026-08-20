import { IsString, IsNotEmpty, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { StyleStatus } from '../../../common/enums/database.enums';

export class CreateStyleDto {
  @IsString()
  @IsNotEmpty({ message: 'Mã mẫu Fit (styleCode) không được để trống' })
  styleCode: string;

  @IsString()
  @IsNotEmpty({ message: 'Tên mẫu Fit (styleName) không được để trống' })
  styleName: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsUUID()
  @IsOptional()
  baseImageVersionId?: string;

  @IsEnum(StyleStatus)
  @IsOptional()
  status?: StyleStatus;
}
