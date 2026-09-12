import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BomListItemDto {
  @ApiProperty({ example: '1ef44833-6558-4870-9601-b53d82926dbf' })
  id: string;

  @ApiProperty({ example: 'po', enum: ['fit', 'po'] })
  objectType: 'fit' | 'po';

  @ApiProperty({ example: 'PO-2026-001' })
  objectCode: string;

  @ApiProperty({ example: 'po-1' })
  poId: string;

  @ApiPropertyOptional({ example: 'line-1' })
  lineId?: string;

  @ApiPropertyOptional({ example: 'color-1' })
  colorId?: string | null;

  @ApiPropertyOptional({ example: 'Navy' })
  colorName?: string | null;

  @ApiProperty({ example: 'STY-POLO-01' })
  styleCode: string;

  @ApiProperty({ example: 'Áo Polo Nam Classic Fit' })
  productName: string;

  @ApiPropertyOptional({ example: 500 })
  poQuantity?: number;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ example: 'Approved' })
  status: string;

  @ApiPropertyOptional({ example: 145000, nullable: true })
  totalCostPerUnit: number | null;

  @ApiPropertyOptional({ example: '2026-09-20T00:00:00.000Z', nullable: true })
  deadline?: string | null;

  @ApiProperty({ example: '2026-09-12T07:00:00.000Z' })
  createdAt: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  imageUrl?: string | null;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 15 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 2 })
  totalPages: number;
}

export class PaginatedBomResponseDto {
  @ApiProperty({ type: [BomListItemDto] })
  data: BomListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
