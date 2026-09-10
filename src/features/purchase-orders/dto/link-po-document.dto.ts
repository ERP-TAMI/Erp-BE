import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';
import { DocumentPurpose } from '../../../common/enums/database.enums';

export class LinkPoDocumentDto {
  @IsUUID('4', { message: 'documentId phải là định dạng UUID hợp lệ' })
  @IsNotEmpty({ message: 'documentId không được để trống' })
  documentId: string;

  @IsEnum(DocumentPurpose, {
    message: 'Mục đích sử dụng tài liệu không hợp lệ',
  })
  @IsNotEmpty({ message: 'purpose không được để trống' })
  purpose: DocumentPurpose;
}
