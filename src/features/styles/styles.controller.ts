import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StylesService, PaginatedResult } from './styles.service';
import { CreateStyleDto, UpdateStyleDto, StyleQueryDto } from './dto';
import { Style } from './entities/Style.entity';

@ApiTags('styles')
@Controller(['styles', 'api/styles', 'api/v1/styles'])
export class StylesController {
  constructor(private readonly stylesService: StylesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo mới mẫu Fit (Style)' })
  @ApiResponse({ status: 201, description: 'Mẫu Fit đã được tạo thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 409, description: 'Mã mẫu Fit đã tồn tại' })
  async create(@Body() dto: CreateStyleDto, @Req() req?: any): Promise<Style> {
    const userId = req?.user?.id || req?.user?.sub;
    return this.stylesService.create(dto, userId);
  }

  @Get()
  @ApiOperation({
    summary: 'Lấy danh sách mẫu Fit (tìm kiếm, lọc & phân trang)',
  })
  @ApiResponse({ status: 200, description: 'Danh sách mẫu Fit' })
  async findAll(
    @Query() query: StyleQueryDto,
  ): Promise<PaginatedResult<Style>> {
    return this.stylesService.findAll(query);
  }

  @Get('code/:styleCode')
  @ApiOperation({ summary: 'Lấy thông tin mẫu Fit theo mã' })
  @ApiResponse({ status: 200, description: 'Chi tiết mẫu Fit' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy mẫu Fit' })
  async findByCode(@Param('styleCode') styleCode: string): Promise<Style> {
    return this.stylesService.findByCode(styleCode);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết mẫu Fit theo ID' })
  @ApiResponse({ status: 200, description: 'Chi tiết mẫu Fit' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy mẫu Fit' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Style> {
    return this.stylesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật mẫu Fit' })
  @ApiResponse({ status: 200, description: 'Mẫu Fit đã được cập nhật' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy mẫu Fit' })
  @ApiResponse({ status: 409, description: 'Mã mẫu Fit mới đã bị trùng' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStyleDto,
    @Req() req?: any,
  ): Promise<Style> {
    const userId = req?.user?.id || req?.user?.sub;
    return this.stylesService.update(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa mẫu Fit theo ID' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Đã xóa mẫu Fit' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy mẫu Fit' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.stylesService.remove(id);
  }
}
