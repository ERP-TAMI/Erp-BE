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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Auth } from '../../common/decorators/auth.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { StylesService, PaginatedResult } from './styles.service';
import {
  CreateStyleDto,
  UpdateStyleDto,
  StyleQueryDto,
  StyleResponseDto,
} from './dto';

const VIEW_PERMISSION = 'master_data.styles.view';
const MANAGE_PERMISSION = 'master_data.styles.manage';

@ApiTags('styles')
@ApiBearerAuth()
@Auth(VIEW_PERMISSION)
@Controller(['styles', 'api/styles', 'api/v1/styles'])
export class StylesController {
  constructor(private readonly stylesService: StylesService) {}

  @Post()
  @Permission(MANAGE_PERMISSION)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo mới mẫu Fit (Style)' })
  @ApiResponse({ status: 201, description: 'Mẫu Fit đã được tạo thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 409, description: 'Mã mẫu Fit đã tồn tại' })
  async create(
    @Body() dto: CreateStyleDto,
    @Req() req?: any,
  ): Promise<StyleResponseDto> {
    const userId = req?.user?.id || req?.user?.sub;
    const style = await this.stylesService.create(dto, userId);
    const resolved = await this.stylesService.withResolvedBaseImage(style);
    return StyleResponseDto.fromEntity(resolved);
  }

  @Get()
  @ApiOperation({
    summary: 'Lấy danh sách mẫu Fit (tìm kiếm, lọc & phân trang)',
  })
  @ApiResponse({ status: 200, description: 'Danh sách mẫu Fit' })
  async findAll(
    @Query() query: StyleQueryDto,
  ): Promise<PaginatedResult<StyleResponseDto>> {
    const result = await this.stylesService.findAll(query);
    return {
      ...result,
      data: await Promise.all(
        result.data.map(async (s) =>
          StyleResponseDto.fromEntity(
            await this.stylesService.withResolvedBaseImage(s),
          ),
        ),
      ),
    };
  }

  @Get('code/:styleCode')
  @ApiOperation({ summary: 'Lấy thông tin mẫu Fit theo mã' })
  @ApiResponse({ status: 200, description: 'Chi tiết mẫu Fit' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy mẫu Fit' })
  async findByCode(
    @Param('styleCode') styleCode: string,
  ): Promise<StyleResponseDto> {
    const style = await this.stylesService.findByCode(styleCode);
    const resolved = await this.stylesService.withResolvedBaseImage(style);
    return StyleResponseDto.fromEntity(resolved);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết mẫu Fit theo ID' })
  @ApiResponse({ status: 200, description: 'Chi tiết mẫu Fit' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy mẫu Fit' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StyleResponseDto> {
    const style = await this.stylesService.findOne(id);
    const resolved = await this.stylesService.withResolvedBaseImage(style);
    return StyleResponseDto.fromEntity(resolved);
  }

  @Patch(':id')
  @Permission(MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Cập nhật mẫu Fit' })
  @ApiResponse({ status: 200, description: 'Mẫu Fit đã được cập nhật' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy mẫu Fit' })
  @ApiResponse({ status: 409, description: 'Mã mẫu Fit mới đã bị trùng' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStyleDto,
    @Req() req?: any,
  ): Promise<StyleResponseDto> {
    const userId = req?.user?.id || req?.user?.sub;
    const actor = userId
      ? { id: userId, roleCode: req?.user?.roleCode }
      : undefined;
    const style = await this.stylesService.update(id, dto, userId, actor);
    const resolved = await this.stylesService.withResolvedBaseImage(style);
    return StyleResponseDto.fromEntity(resolved);
  }

  @Delete(':id')
  @Permission(MANAGE_PERMISSION)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa mẫu Fit theo ID' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Đã xóa mẫu Fit' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy mẫu Fit' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.stylesService.remove(id);
  }
}
