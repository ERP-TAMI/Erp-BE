import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Auth } from '../../common/decorators/auth.decorator';
import { BomsService } from './boms.service';
import { QueryBomsDto, PaginatedBomResponseDto } from './dto';

@ApiTags('boms')
@ApiBearerAuth()
@Auth()
@Controller(['boms', 'api/boms', 'api/v1/boms'])
export class BomsController {
  constructor(private readonly bomsService: BomsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy danh sách Nguyên phụ liệu (BOM) gồm Mẫu Fit và Sản phẩm PO',
    description:
      'Yêu cầu xác thực JWT. Hỗ trợ phân trang và lọc theo Đối tượng (fit/po), Trạng thái, Mã PO, Tìm kiếm Style/Sản phẩm và Màu sắc. ' +
      'Giá thành chỉ hiển thị cho TPKH, Kế toán, SA/Giám đốc; NVKH và R&D nhận giá trị null.',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách BOM phân trang thành công',
    type: PaginatedBomResponseDto,
  })
  async findAll(
    @Query() query: QueryBomsDto,
    @Req() req?: any,
  ): Promise<PaginatedBomResponseDto> {
    const user = req?.user;
    return this.bomsService.findAll(query, user);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lấy chi tiết BOM theo ID' })
  @ApiResponse({ status: 200, description: 'Chi tiết BOM' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy BOM' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req?: any,
  ): Promise<any> {
    const user = req?.user;
    return this.bomsService.findOne(id, user);
  }
}
