import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentPurpose } from '../../../common/enums/database.enums';

/**
 * Tham số phân trang cho danh sách tài liệu của một PO.
 *
 * `limit` chặn trên ở 100 vì mỗi tài liệu trả về kèm một presigned URL, tức là
 * một lần gọi S3 — không giới hạn thì một PO nhiều tài liệu sẽ kéo response
 * chậm theo số lượng.
 */
export class QueryPoDocumentDto {
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

  /** Lọc theo mục đích tài liệu; bỏ trống là lấy tất cả. */
  @IsOptional()
  @IsEnum(DocumentPurpose)
  purpose?: DocumentPurpose;
}
