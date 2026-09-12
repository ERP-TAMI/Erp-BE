import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryBomsDto {
  @ApiPropertyOptional({
    description: 'Đối tượng: fit (Mẫu Fit), po (Sản phẩm PO), hoặc all',
    enum: ['fit', 'po', 'all'],
  })
  @IsOptional()
  @IsIn(['fit', 'po', 'all'])
  objectType?: 'fit' | 'po' | 'all';

  @ApiPropertyOptional({
    description: 'Trạng thái BOM: Draft, Wait_RD, Wait_Price, Wait_TP_Approve, Wait_SA_Approve, Approved',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Lọc theo mã PO' })
  @IsOptional()
  @IsString()
  poCode?: string;

  @ApiPropertyOptional({ description: 'Tìm kiếm theo Mã Fit, Style, hoặc Tên Sản phẩm' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc theo màu' })
  @IsOptional()
  @IsString()
  colorName?: string;
}
