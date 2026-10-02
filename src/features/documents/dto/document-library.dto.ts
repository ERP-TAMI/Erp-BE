import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DocumentLibraryQueryDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(100)
  @IsOptional()
  limit?: number = 10;

  @IsOptional()
  @IsUUID('4')
  folderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  archived?: 'true' | 'false';

  @IsOptional()
  @IsIn(['true', 'false'])
  assigned?: 'true' | 'false';

  @IsOptional()
  @IsIn(['word', 'excel', 'pdf', 'image'])
  category?: 'word' | 'excel' | 'pdf' | 'image';

  @IsOptional()
  @IsIn(['newest', 'oldest'])
  sortOrder?: 'newest' | 'oldest' = 'newest';
}

export class DocumentFoldersQueryDto {
  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class DocumentFolderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  folderName: string;

  @IsOptional()
  @IsUUID('4')
  parentId?: string;
}

export class PresignLibraryDocumentDto {
  @IsUUID('4')
  folderId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  fileName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  mimeType: string;

  @IsInt()
  @IsPositive()
  sizeBytes: number;
}

export class ConfirmLibraryDocumentDto extends PresignLibraryDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  objectKey: string;
}

export class PresignDocumentVersionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  fileName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  mimeType: string;

  @IsInt()
  @IsPositive()
  sizeBytes: number;
}

export class ConfirmDocumentVersionDto extends PresignDocumentVersionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  objectKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeReason?: string;
}

export class AssignLibraryDocumentsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  documentIds: string[];
}

export class DocumentVersionQueryDto {
  @IsOptional()
  @IsUUID('4')
  versionId?: string;
}
