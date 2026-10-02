import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ConfirmPoDocumentDto } from './confirm-po-document.dto';

export class ConfirmPoDocumentVersionDto extends ConfirmPoDocumentDto {
  @IsString()
  @IsNotEmpty({ message: 'changeReason không được để trống' })
  @MaxLength(5000)
  changeReason: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  evidenceObjectKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceFileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  evidenceMimeType?: string;
}
