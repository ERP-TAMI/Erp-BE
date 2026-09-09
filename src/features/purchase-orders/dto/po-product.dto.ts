import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsDateString,
  MaxLength,
  IsInt,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePoProductDto {
  @ApiPropertyOptional({
    description: 'ID mẫu Fit nguồn (nếu liên kết từ Style có sẵn)',
    example: 'd9b2d63d-a233-4f9e-a89e-2938804918e7',
  })
  @IsOptional()
  @IsUUID('4', { message: 'sourceStyleId phải là UUID hợp lệ' })
  sourceStyleId?: string;

  @ApiPropertyOptional({
    description: 'Alias cho sourceStyleId',
  })
  @IsOptional()
  @IsUUID('4', { message: 'styleId phải là UUID hợp lệ' })
  styleId?: string;

  @ApiPropertyOptional({
    description: 'Mã sản phẩm / Style trong PO',
    example: 'PROD-2026-001',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'productCode phải là chuỗi ký tự' })
  @MaxLength(100, { message: 'productCode không vượt quá 100 ký tự' })
  productCode?: string;

  @ApiPropertyOptional({
    description: 'Alias cho productCode',
    example: 'ST-2026-001',
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'styleCode phải là chuỗi ký tự' })
  @MaxLength(100, { message: 'styleCode không vượt quá 100 ký tự' })
  styleCode?: string;

  @ApiProperty({
    description: 'Tên sản phẩm',
    example: 'Áo Polo Nam Classic Fit',
    maxLength: 255,
  })
  @IsString({ message: 'productName phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'productName không được để trống' })
  @MaxLength(255, { message: 'productName không vượt quá 255 ký tự' })
  productName: string;

  @ApiPropertyOptional({
    description: 'Danh mục sản phẩm (Shirt, Pants, Jacket, Polo, v.v.)',
    example: 'Polo',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({
    description: 'Ghi chú chất liệu / nguyên phụ liệu',
    example: 'Cotton 95% + Spandex 5%',
  })
  @IsOptional()
  @IsString()
  materialNote?: string;

  @ApiPropertyOptional({
    description: 'Alias cho materialNote / màu sắc',
  })
  @IsOptional()
  @IsString()
  colorName?: string;

  @ApiPropertyOptional({
    description: 'Trạng thái dòng sản phẩm (dành cho client gửi lên)',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Hạn giao hàng của sản phẩm',
    example: '2026-10-15',
  })
  @IsOptional()
  @IsDateString({}, { message: 'deadline phải là định dạng ngày YYYY-MM-DD' })
  deadline?: string;

  @ApiPropertyOptional({
    description: 'Số ngày chu kỳ CM cơ bản (AS3B)',
    example: 30,
    default: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  as3bCmBaseDays?: number;
}

export class UpdatePoProductDto {
  @ApiPropertyOptional({
    description: 'Mã sản phẩm / Style trong PO',
    example: 'PROD-2026-001',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  productCode?: string;

  @ApiPropertyOptional({
    description: 'Alias cho productCode',
    example: 'ST-2026-001',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  styleCode?: string;

  @ApiPropertyOptional({
    description: 'ID mẫu Fit nguồn',
  })
  @IsOptional()
  @IsUUID('4')
  sourceStyleId?: string;

  @ApiPropertyOptional({
    description: 'Alias cho sourceStyleId',
  })
  @IsOptional()
  @IsUUID('4')
  styleId?: string;

  @ApiPropertyOptional({
    description: 'Tên sản phẩm',
    example: 'Áo Polo Nam Classic Fit',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  productName?: string;

  @ApiPropertyOptional({
    description: 'Danh mục sản phẩm',
    example: 'Polo',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({
    description: 'Ghi chú chất liệu',
    example: 'Cotton 95% + Spandex 5%',
  })
  @IsOptional()
  @IsString()
  materialNote?: string;

  @ApiPropertyOptional({
    description: 'Alias cho materialNote',
  })
  @IsOptional()
  @IsString()
  colorName?: string;

  @ApiPropertyOptional({
    description: 'Trạng thái dòng sản phẩm',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Hạn giao hàng của sản phẩm',
    example: '2026-10-15',
  })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({
    description: 'Số ngày chu kỳ CM cơ bản (AS3B)',
    example: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  as3bCmBaseDays?: number;
}
