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
import { BomsService } from './boms.service';
import { QueryBomsDto, BomListItemDto } from './dto';

@ApiTags('boms')
@ApiBearerAuth()
@Controller(['boms', 'api/boms', 'api/v1/boms'])
export class BomsController {
  constructor(private readonly bomsService: BomsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy danh sách Nguyên phụ liệu (BOM) gồm Mẫu Fit và Sản phẩm PO',
    description:
      'Hỗ trợ lọc theo Đối tượng (fit/po), Trạng thái, Mã PO, Tìm kiếm Style/Sản phẩm và Màu sắc. ' +
      'Giá thành chỉ hiển thị cho TPKH, Kế toán, SA/Giám đốc; NVKH và R&D nhận giá trị null.',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách BOM thành công',
    type: [BomListItemDto],
  })
  async findAll(
    @Query() query: QueryBomsDto,
    @Req() req?: any,
  ): Promise<BomListItemDto[]> {
    const user = req?.user;
    const headerRole = (req?.headers?.['x-user-role'] as string) || undefined;
    return this.bomsService.findAll(query, user, headerRole);
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
    const headerRole = (req?.headers?.['x-user-role'] as string) || undefined;
    return this.bomsService.findOne(id, user, headerRole);
  }
}
