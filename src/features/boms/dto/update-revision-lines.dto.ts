import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RevisionLineItemDto {
  @ApiPropertyOptional({ description: 'ID vật tư master data (nếu có)' })
  @IsOptional()
  @IsUUID()
  materialId?: string;

  @ApiProperty({ description: 'Tên vật tư snapshot (bắt buộc)' })
  @IsString()
  materialNameSnapshot: string;

  @ApiPropertyOptional({ description: 'Nhóm vật tư snapshot' })
  @IsOptional()
  @IsString()
  materialGroupSnapshot?: string;

  @ApiPropertyOptional({ description: 'Đơn vị tính snapshot' })
  @IsOptional()
  @IsString()
  unitSnapshot?: string;

  @ApiPropertyOptional({ description: 'ID nhóm vật tư master data' })
  @IsOptional()
  @IsUUID()
  materialGroupId?: string;

  @ApiPropertyOptional({ description: 'ID đơn vị tính master data' })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({
    description: 'Định mức tiêu hao (consumption / consumptionPerUnit)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  consumption?: number;

  @ApiPropertyOptional({
    description: 'Tương đương consumption (dành cho PO BOM)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  consumptionPerUnit?: number;

  @ApiPropertyOptional({ description: 'Tỷ lệ hao hụt % (dành cho Fit BOM)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  wastePercent?: number;

  @ApiPropertyOptional({
    description: 'Đơn giá vật tư VNĐ (dành cho PO BOM)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Ghi chú vật tư' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Thứ tự hiển thị' })
  @IsOptional()
  @IsNumber()
  orderIndex?: number;
}

export class UpdateRevisionLinesDto {
  @ApiPropertyOptional({ description: 'Lý do thay đổi nội dung revision' })
  @IsOptional()
  @IsString()
  changeReason?: string;

  @ApiPropertyOptional({
    description: 'Row version mong muốn (kiểm tra optimistic locking)',
  })
  @IsOptional()
  @IsNumber()
  expectedRowVersion?: number;

  @ApiProperty({
    description: 'Danh sách các dòng vật tư BOM của revision',
    type: [RevisionLineItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RevisionLineItemDto)
  lines: RevisionLineItemDto[];
}
