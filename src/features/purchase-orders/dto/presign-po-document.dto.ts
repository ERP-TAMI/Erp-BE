import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
} from 'class-validator';
import { DocumentPurpose } from '../../../common/enums/database.enums';

export class PresignPoDocumentDto {
  @IsString()
  @IsNotEmpty({ message: 'fileName không được để trống' })
  fileName: string;

  @IsString()
  @IsNotEmpty({ message: 'mimeType không được để trống' })
  mimeType: string;

  @IsInt()
  @IsPositive({ message: 'sizeBytes phải lớn hơn 0' })
  sizeBytes: number;

  @IsEnum(DocumentPurpose, { message: 'purpose không hợp lệ' })
  purpose: DocumentPurpose;
}
