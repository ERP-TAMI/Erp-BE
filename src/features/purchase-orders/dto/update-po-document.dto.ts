import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DocumentPurpose } from '../../../common/enums/database.enums';

export class UpdatePoDocumentDto {
  @ApiProperty({
    enum: DocumentPurpose,
    description: 'Mục đích sử dụng tài liệu mới',
    example: DocumentPurpose.SAMPLE_IMAGE,
  })
  @IsEnum(DocumentPurpose, {
    message: 'Mục đích sử dụng tài liệu không hợp lệ',
  })
  @IsNotEmpty({ message: 'purpose không được để trống' })
  purpose: DocumentPurpose;
}
