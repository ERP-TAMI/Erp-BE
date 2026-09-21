import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BomRevisionStatus } from '../../../common/enums/database.enums';
import { BomLineResponseDto } from './bom-response.dto';

export class RevisionListItemDto {
  @ApiProperty({ description: 'ID của revision' })
  id: string;

  @ApiProperty({ description: 'ID của BOM sở hữu' })
  bomId: string;

  @ApiProperty({ description: 'Số phiên bản (revisionNo)' })
  revisionNo: number;

  @ApiProperty({
    enum: BomRevisionStatus,
    description: 'Trạng thái workflow của revision',
  })
  status: BomRevisionStatus;

  @ApiPropertyOptional({
    description: 'ID của revision gốc được sao chép',
    nullable: true,
  })
  sourceRevisionId: string | null;

  @ApiPropertyOptional({
    description: 'Lý do tạo revision',
    nullable: true,
  })
  changeReason: string | null;

  @ApiPropertyOptional({ description: 'ID người tạo', nullable: true })
  createdBy: string | null;

  @ApiProperty({ description: 'Thời điểm tạo' })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'ID người phê duyệt', nullable: true })
  approvedBy: string | null;

  @ApiPropertyOptional({
    description: 'Thời điểm phê duyệt',
    nullable: true,
  })
  approvedAt: Date | null;

  @ApiProperty({
    description: 'Đánh dấu có phải là working revision hiện tại hay không',
  })
  isCurrent: boolean;
}

export class RevisionDetailDto extends RevisionListItemDto {
  @ApiProperty({
    description: 'Danh sách dòng vật tư trong revision này',
  })
  lines: BomLineResponseDto[];

  @ApiPropertyOptional({
    description:
      'Tổng chi phí định mức trên 1 sản phẩm (null nếu không có quyền)',
    nullable: true,
  })
  costPerUnit: number | null;
}

export type RevisionDiffType = 'ADDED' | 'REMOVED' | 'CHANGED' | 'UNCHANGED';

export class RevisionDiffLineSnapshotDto {
  consumption: number;
  unitCost: number | null;
  lineCost: number | null;
  note: string | null;
  orderIndex: number;
  materialNameSnapshot: string;
  materialGroupSnapshot: string | null;
  unitSnapshot: string;
}

export class RevisionDiffItemDto {
  @ApiProperty({ description: 'ID của vật tư dùng làm khóa định danh' })
  materialId: string;

  @ApiProperty({ description: 'Tên snapshot của vật tư' })
  materialNameSnapshot: string;

  @ApiPropertyOptional({ description: 'Tên nhóm vật tư', nullable: true })
  materialGroupSnapshot: string | null;

  @ApiProperty({ description: 'Đơn vị tính' })
  unitSnapshot: string;

  @ApiProperty({
    enum: ['ADDED', 'REMOVED', 'CHANGED', 'UNCHANGED'],
    description: 'Phân loại thay đổi',
  })
  diffType: RevisionDiffType;

  @ApiPropertyOptional({ description: 'Dữ liệu dòng ở revision nguồn' })
  oldLine: RevisionDiffLineSnapshotDto | null;

  @ApiPropertyOptional({ description: 'Dữ liệu dòng ở revision đích' })
  newLine: RevisionDiffLineSnapshotDto | null;

  @ApiPropertyOptional({
    description: 'Chi tiết các trường thay đổi giữa 2 revision',
  })
  changes: Record<string, { old: any; new: any }>;
}

export class RevisionDiffDto {
  @ApiProperty({ description: 'ID BOM' })
  bomId: string;

  @ApiProperty({ description: 'ID của revision đích (Target)' })
  targetRevisionId: string;

  @ApiProperty({ description: 'Số phiên bản của revision đích' })
  targetRevisionNo: number;

  @ApiProperty({ description: 'ID của revision nguồn/so sánh (Base)' })
  baseRevisionId: string;

  @ApiProperty({ description: 'Số phiên bản của revision nguồn' })
  baseRevisionNo: number;

  @ApiPropertyOptional({
    description: 'Đơn giá / SP của revision nguồn (null nếu không có quyền)',
    nullable: true,
  })
  oldCostPerUnit: number | null;

  @ApiPropertyOptional({
    description: 'Đơn giá / SP của revision đích (null nếu không có quyền)',
    nullable: true,
  })
  newCostPerUnit: number | null;

  @ApiPropertyOptional({
    description: 'Chênh lệch chi phí (newCostPerUnit - oldCostPerUnit)',
    nullable: true,
  })
  costDifference: number | null;

  @ApiProperty({ description: 'Số dòng vật tư thêm mới' })
  totalAdded: number;

  @ApiProperty({ description: 'Số dòng vật tư bị xóa' })
  totalRemoved: number;

  @ApiProperty({ description: 'Số dòng vật tư bị thay đổi thông số' })
  totalChanged: number;

  @ApiProperty({ description: 'Số dòng vật tư không thay đổi' })
  totalUnchanged: number;

  @ApiProperty({
    type: [RevisionDiffItemDto],
    description: 'Danh sách chi tiết so sánh từng vật tư',
  })
  items: RevisionDiffItemDto[];
}
