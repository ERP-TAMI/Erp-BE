import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsAbsent } from './create-bom.dto';

export class CopyFitToPoDto {
  @ApiPropertyOptional({
    description:
      'UUID của revision Fit BOM nguồn (phải thuộc Fit BOM tương ứng và ở trạng thái closed). Nếu bỏ trống, hệ thống sẽ tự tìm Fit BOM tương ứng theo styleId của sản phẩm đơn hàng.',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'sourceRevisionId must be a valid UUID' })
  sourceRevisionId?: string;

  // ─── Whitelist & Injection Prevention ──────────────────────────────────────

  @ApiPropertyOptional({ description: 'Không nhận sourceBomId từ client' })
  @IsAbsent({ message: 'sourceBomId is not accepted from client' })
  sourceBomId?: any;

  @ApiPropertyOptional({ description: 'Không nhận targetBomId từ client' })
  @IsAbsent({ message: 'targetBomId is not accepted from client' })
  targetBomId?: any;

  @ApiPropertyOptional({ description: 'Không nhận targetRevisionId từ client' })
  @IsAbsent({ message: 'targetRevisionId is not accepted from client' })
  targetRevisionId?: any;

  @ApiPropertyOptional({ description: 'Không nhận unitCost từ client' })
  @IsAbsent({ message: 'unitCost is not accepted from client' })
  unitCost?: any;

  @ApiPropertyOptional({ description: 'Không nhận lines từ client' })
  @IsAbsent({ message: 'lines is not accepted from client' })
  lines?: any;

  @ApiPropertyOptional({
    description: 'Không nhận colorNameSnapshot từ client',
  })
  @IsAbsent({ message: 'colorNameSnapshot is not accepted from client' })
  colorNameSnapshot?: any;

  @ApiPropertyOptional({
    description: 'Không nhận orderQuantitySnapshot từ client',
  })
  @IsAbsent({ message: 'orderQuantitySnapshot is not accepted from client' })
  orderQuantitySnapshot?: any;

  @ApiPropertyOptional({ description: 'Không nhận status từ client' })
  @IsAbsent({ message: 'status is not accepted from client' })
  status?: any;

  @ApiPropertyOptional({ description: 'Không nhận productColorId từ client' })
  @IsAbsent({ message: 'productColorId is not accepted in BOM V2' })
  productColorId?: any;
}
