import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStyleOperationStepDto {
  @ApiPropertyOptional({ description: 'ID công đoạn cha (nếu thuộc nhóm)' })
  @IsOptional()
  @IsUUID()
  parentStepId?: string;

  @ApiPropertyOptional({ description: 'ID stage master (nếu từ dữ liệu nền)' })
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @ApiProperty({ description: 'Tên công đoạn' })
  @IsString()
  stepName: string;

  @ApiPropertyOptional({ description: 'Mô tả công đoạn' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Thời gian per piece (giây/SP)',
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  timePerPiece?: number;

  @ApiPropertyOptional({ description: 'SSV (giây)', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  ssv?: number;

  @ApiPropertyOptional({ description: 'Tổng chỉ tiêu sản phẩm', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetTotal?: number;

  @ApiPropertyOptional({ description: 'Ghi chú công đoạn' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Thứ tự hiển thị', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  orderIndex?: number;

  @ApiPropertyOptional({
    description: 'Có phải nhóm công đoạn hay không',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isGroup?: boolean;

  @ApiPropertyOptional({ description: 'ID của nhóm master data (nếu có)' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({
    description: 'Danh sách items công đoạn con trong nhóm (snapshot)',
  })
  @IsOptional()
  groupItems?: any;
}

export class UpdateStyleOperationStepDto {
  @ApiPropertyOptional({ description: 'ID công đoạn cha (nếu thuộc nhóm)' })
  @IsOptional()
  @IsUUID()
  parentStepId?: string;

  @ApiPropertyOptional({ description: 'ID stage master (nếu từ dữ liệu nền)' })
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @ApiPropertyOptional({ description: 'Tên công đoạn' })
  @IsOptional()
  @IsString()
  stepName?: string;

  @ApiPropertyOptional({ description: 'Mô tả công đoạn' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Thời gian per piece (giây/SP)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  timePerPiece?: number;

  @ApiPropertyOptional({ description: 'SSV (giây)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  ssv?: number;

  @ApiPropertyOptional({ description: 'Tổng chỉ tiêu sản phẩm' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetTotal?: number;

  @ApiPropertyOptional({ description: 'Ghi chú công đoạn' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Thứ tự hiển thị' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  orderIndex?: number;

  @ApiPropertyOptional({ description: 'Có phải nhóm công đoạn hay không' })
  @IsOptional()
  @IsBoolean()
  isGroup?: boolean;

  @ApiPropertyOptional({ description: 'ID của nhóm master data (nếu có)' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({
    description: 'Danh sách items công đoạn con trong nhóm (snapshot)',
  })
  @IsOptional()
  groupItems?: any;
}

export class StyleOperationStepItemDto extends CreateStyleOperationStepDto {
  @ApiPropertyOptional({ description: 'ID dòng công đoạn (nếu đã có)' })
  @IsOptional()
  @IsString()
  id?: string;
}

export class BulkSaveStyleOperationStepsDto {
  @ApiProperty({
    description: 'Danh sách các dòng công đoạn',
    type: [StyleOperationStepItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StyleOperationStepItemDto)
  steps: StyleOperationStepItemDto[];

  @ApiPropertyOptional({
    description: 'Số ngày cơ sở tính CM công nghệ (mặc định 30)',
    default: 30,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  as3bCmBaseDays?: number;
}

export class ReorderStyleOperationStepsDto {
  @ApiProperty({
    description: 'Mảng chứa ID các công đoạn theo thứ tự mới',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  orderedIds: string[];
}
