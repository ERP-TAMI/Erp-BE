import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SampleStatus } from '../../../common/enums/database.enums';

export class CreateStyleSampleRoundDto {
  @ApiPropertyOptional({ description: 'Ngày may mẫu (mặc định hôm nay)' })
  @IsOptional()
  @IsDateString()
  sampleDate?: string;

  @ApiPropertyOptional({ description: 'Ghi chú lần may mẫu' })
  @IsOptional()
  @IsString()
  feedback?: string;

  @ApiPropertyOptional({
    enum: SampleStatus,
    description: 'Trạng thái lần may mẫu, mặc định "Đang làm"',
  })
  @IsOptional()
  @IsEnum(SampleStatus, { message: 'status không hợp lệ' })
  status?: SampleStatus;
}

export class UpdateStyleSampleRoundDto {
  @ApiPropertyOptional({ description: 'Ngày may mẫu' })
  @IsOptional()
  @IsDateString()
  sampleDate?: string;

  @ApiPropertyOptional({ description: 'Ghi chú lần may mẫu' })
  @IsOptional()
  @IsString()
  feedback?: string;

  @ApiPropertyOptional({
    enum: SampleStatus,
    description: 'Trạng thái lần may mẫu',
  })
  @IsOptional()
  @IsEnum(SampleStatus, { message: 'status không hợp lệ' })
  status?: SampleStatus;
}

export class PresignStyleSampleImageDto {
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

export class ConfirmStyleSampleImageDto {
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
