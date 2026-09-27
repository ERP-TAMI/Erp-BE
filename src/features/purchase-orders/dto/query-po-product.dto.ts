import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Tham số phân trang cho danh sách sản phẩm của một PO.
 *
 * `limit` chặn trên ở 100 vì mỗi sản phẩm có ảnh sẽ tốn một lần ký URL S3.
 */
export class QueryPoProductDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
