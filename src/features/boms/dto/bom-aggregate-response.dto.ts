import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AggregateBreakdownItemDto {
  @ApiPropertyOptional({
    description: 'ID sản phẩm PO',
  })
  productId?: string;

  @ApiPropertyOptional({
    description: 'Mã sản phẩm PO',
    example: '7918B293MB',
  })
  productCode?: string;

  @ApiPropertyOptional({
    description: 'Tên sản phẩm PO',
    example: 'Pull On Flare Pants',
  })
  productName?: string;

  @ApiPropertyOptional({
    description: 'Tên màu sắc (nếu phân rã theo màu)',
    example: 'Đen',
  })
  colorName?: string;

  @ApiPropertyOptional({
    description: 'Nhãn kích cỡ (nếu phân rã theo size)',
    example: 'L',
  })
  sizeLabel?: string;

  @ApiProperty({
    description: 'Nhu cầu nguyên phụ liệu tương ứng cho màu/size này',
    example: 250,
  })
  requiredQuantity: number;
}

export class BomAggregateItemDto {
  @ApiProperty({
    description: 'UUID định danh vật tư',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  materialId: string;

  @ApiProperty({
    description: 'Mã vật tư hiện tại từ danh mục nguyên phụ liệu',
    example: 'FAB-00042',
    nullable: true,
  })
  materialCode: string | null;

  @ApiProperty({
    description: 'Snapshot tên vật tư lịch sử',
    example: 'Vải Cotton 100% 220gsm',
  })
  materialNameSnapshot: string;

  @ApiPropertyOptional({
    description: 'Snapshot nhóm vật tư lịch sử',
    example: 'Vải chính',
  })
  materialGroupSnapshot: string | null;

  @ApiProperty({ description: 'Snapshot đơn vị tính lịch sử', example: 'Mét' })
  unitSnapshot: string;

  @ApiProperty({
    description:
      'Tổng nhu cầu nguyên phụ liệu cần cung ứng cho các đơn hàng PO đã duyệt',
    example: 1250.5,
  })
  totalRequiredQuantity: number;

  @ApiProperty({
    description: 'Số lượng BOM PO tham gia tổng hợp vật tư này',
    example: 3,
  })
  bomCount: number;

  @ApiProperty({
    description: 'Số lượng sản phẩm PO tham gia tổng hợp vật tư này',
    example: 3,
  })
  poProductCount: number;

  @ApiPropertyOptional({
    description: 'Đơn giá vật tư (nếu có quyền xem và đơn giá đầy đủ)',
    example: 120000,
    nullable: true,
  })
  unitCost?: number | null;

  @ApiPropertyOptional({
    description:
      'Tổng chi phí dự toán (null nếu vai trò không có quyền xem hoặc có dòng chưa nhập đơn giá)',
    example: 150060000,
    nullable: true,
  })
  totalEstimatedCost: number | null;

  @ApiProperty({
    description:
      'Chỉ báo toàn bộ các dòng vật tư tham gia đều đã có đơn giá hợp lệ',
    example: true,
  })
  costComplete: boolean;

  @ApiPropertyOptional({
    description: 'Danh sách phân rã theo màu sắc / kích cỡ nếu được yêu cầu',
    type: [AggregateBreakdownItemDto],
  })
  breakdown?: AggregateBreakdownItemDto[];
}
