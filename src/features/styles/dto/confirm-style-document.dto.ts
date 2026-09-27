import { IsInt, IsNotEmpty, IsPositive, IsString } from 'class-validator';

export class ConfirmStyleDocumentDto {
  @IsString()
  @IsNotEmpty({ message: 'objectKey không được để trống' })
  objectKey: string;

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
