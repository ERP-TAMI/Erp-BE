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
import {
  PurchaseOrdersService,
  PaginatedPoResult,
  PurchaseOrderDetailResponse,
} from './purchase-orders.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  QueryPurchaseOrderDto,
  UpdatePoStatusDto,
  LinkPoDocumentDto,
} from './dto';
import { PurchaseOrder } from './entities/PurchaseOrder.entity';
import { PurchaseOrderStatusHistory } from './entities/PurchaseOrderStatusHistory.entity';

@ApiTags('purchase-orders')
@Controller([
  'purchase-orders',
  'api/purchase-orders',
  'api/v1/purchase-orders',
])
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo mới đơn hàng Purchase Order (PO)' })
  @ApiResponse({ status: 201, description: 'Đơn hàng PO được tạo thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
  @ApiResponse({ status: 409, description: 'Mã PO đã tồn tại' })
  async create(
    @Body() dto: CreatePurchaseOrderDto,
    @Req() req?: any,
  ): Promise<PurchaseOrderDetailResponse> {
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.create(dto, userId);
  }

  @Get()
  @ApiOperation({
    summary: 'Lấy danh sách đơn hàng PO (tìm kiếm, lọc & phân trang)',
  })
  @ApiResponse({ status: 200, description: 'Danh sách đơn hàng PO' })
  async findAll(
    @Query() query: QueryPurchaseOrderDto,
  ): Promise<PaginatedPoResult<PurchaseOrder>> {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết đơn hàng PO theo ID' })
  @ApiResponse({ status: 200, description: 'Chi tiết đơn hàng PO' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy PO' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PurchaseOrderDetailResponse> {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật thông tin đơn hàng PO' })
  @ApiResponse({ status: 200, description: 'Đơn hàng PO đã được cập nhật' })
  @ApiResponse({ status: 400, description: 'PO đã chốt Final (bị khóa)' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy PO' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @Req() req?: any,
  ): Promise<PurchaseOrderDetailResponse> {
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.update(id, dto, userId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Chuyển trạng thái đơn hàng PO (State machine)' })
  @ApiResponse({ status: 200, description: 'Trạng thái PO đã được cập nhật' })
  @ApiResponse({
    status: 400,
    description: 'Chuyển trạng thái sai luồng hoặc thiếu lý do',
  })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePoStatusDto,
    @Req() req?: any,
  ): Promise<PurchaseOrderDetailResponse> {
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.updateStatus(id, dto, userId);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Xem nhật ký thay đổi trạng thái PO' })
  @ApiResponse({ status: 200, description: 'Lịch sử thay đổi trạng thái PO' })
  async findHistory(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PurchaseOrderStatusHistory[]> {
    return this.service.findHistory(id);
  }

  @Post(':id/documents')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gán tài liệu vào đơn hàng PO' })
  @ApiResponse({ status: 200, description: 'Tài liệu đã được gán vào PO' })
  async linkDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkPoDocumentDto,
    @Req() req?: any,
  ): Promise<PurchaseOrderDetailResponse> {
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.linkDocument(id, dto, userId);
  }

  @Delete(':id/documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bỏ gán tài liệu khỏi PO (Không xóa file gốc)' })
  @ApiResponse({ status: 204, description: 'Đã gỡ gán tài liệu khỏi PO' })
  async unlinkDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<void> {
    return this.service.unlinkDocument(id, documentId);
  }
}
