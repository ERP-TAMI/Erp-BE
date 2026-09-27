import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { DocumentPurpose } from '../../../common/enums/database.enums';

export enum StorageEntityType {
  STYLE = 'style',
  PURCHASE_ORDER = 'purchase-order',
}

export class PresignUploadDto {
  @IsEnum(StorageEntityType, { message: 'entityType không hợp lệ' })
  entityType: StorageEntityType;

  @IsUUID('4', { message: 'entityId phải là định dạng UUID hợp lệ' })
  entityId: string;

  @IsEnum(DocumentPurpose, { message: 'purpose không hợp lệ' })
  purpose: DocumentPurpose;

  @IsString()
  @IsNotEmpty({ message: 'fileName không được để trống' })
  fileName: string;

  @IsString()
  @IsNotEmpty({ message: 'mimeType không được để trống' })
  mimeType: string;

  @IsInt()
  @IsPositive({ message: 'sizeBytes phải lớn hơn 0' })
  sizeBytes: number;
}
