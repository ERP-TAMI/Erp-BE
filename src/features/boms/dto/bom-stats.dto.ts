import { ApiProperty } from '@nestjs/swagger';

export class BomStatsDto {
  @ApiProperty({ description: 'Tổng số bảng NPL' })
  total: number;

  @ApiProperty({ description: 'Số lượng NPL trạng thái Nháp' })
  draftCount: number;

  @ApiProperty({ description: 'Số lượng NPL đang chờ xử lý (R&D, giá, duyệt)' })
  pendingCount: number;

  @ApiProperty({ description: 'Số lượng NPL đã duyệt hoặc đã khóa' })
  approvedCount: number;
}
