import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductionDocStatus } from '../../../common/enums/database.enums';

export class CreateProductionDocSectionDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  sectionCode?: string;

  @IsNumber()
  @IsOptional()
  orderIndex?: number;

  @IsBoolean()
  @IsOptional()
  isFixed?: boolean;

  @IsArray()
  @IsOptional()
  imageUrls?: string[];

  @IsArray()
  @IsOptional()
  imageGroups?: any[];
}

export class CreateProductionDocSizeRowDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsNotEmpty()
  sizeLabel: string;

  @IsString()
  @IsNotEmpty()
  measurementName: string;

  @IsString()
  @IsOptional()
  measurementValue?: string;

  @IsString()
  @IsOptional()
  tolerance?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsNumber()
  @IsOptional()
  orderIndex?: number;
}

export class CreateStyleProductionDocDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ProductionDocStatus)
  @IsOptional()
  status?: ProductionDocStatus;

  @IsString()
  @IsOptional()
  section1Description?: string;

  @IsString()
  @IsOptional()
  section1ImageUrl?: string;

  @IsString()
  @IsOptional()
  section2Accessories?: string;

  @IsString()
  @IsOptional()
  section3Notes?: string;

  @IsString()
  @IsOptional()
  section4CustomerFeedback?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateProductionDocSizeRowDto)
  sizeRows?: CreateProductionDocSizeRowDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateProductionDocSectionDto)
  sections?: CreateProductionDocSectionDto[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  attachmentIds?: string[];
}
