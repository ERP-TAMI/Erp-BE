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
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
} from '@nestjs/swagger';
import {
  PurchaseOrdersService,
  PaginatedPoResult,
  PurchaseOrderDetailResponse,
  PoDocumentPreviewResponse,
} from './purchase-orders.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  QueryPurchaseOrderDto,
  UpdatePoStatusDto,
  LinkPoDocumentDto,
  UpdatePoDocumentDto,
  CreatePoProductDto,
  UpdatePoProductDto,
} from './dto';
import { PurchaseOrder } from './entities/PurchaseOrder.entity';
import { PurchaseOrderProduct } from './entities/PurchaseOrderProduct.entity';
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
  ): Promise<PaginatedPoResult<PurchaseOrder & { productsCount: number }>> {
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
  @ApiResponse({ status: 400, description: 'PO đã ở trạng thái Đã khóa' })
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

  // ─── PO Products / Lines Endpoints ──────────────────────────────────────────

  @Get(':id/products')
  @ApiOperation({ summary: 'Lấy danh sách sản phẩm thuộc đơn hàng PO' })
  @ApiResponse({ status: 200, description: 'Danh sách sản phẩm trong PO' })
  async getProducts(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PurchaseOrderProduct[]> {
    return this.service.getProducts(id);
  }

  @Post(':id/products')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Thêm sản phẩm mới vào đơn hàng PO' })
  @ApiResponse({ status: 201, description: 'Sản phẩm đã được thêm vào PO' })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ hoặc PO đã khóa',
  })
  @ApiResponse({ status: 409, description: 'Mã sản phẩm đã tồn tại trong PO' })
  async addProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePoProductDto,
    @Req() req?: any,
  ): Promise<PurchaseOrderProduct> {
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.addProduct(id, dto, userId);
  }

  @Patch(':id/products/:productId')
  @ApiOperation({ summary: 'Cập nhật sản phẩm trong đơn hàng PO' })
  @ApiResponse({ status: 200, description: 'Sản phẩm đã được cập nhật' })
  @ApiResponse({ status: 400, description: 'PO đã khóa' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy sản phẩm' })
  async updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdatePoProductDto,
    @Req() req?: any,
  ): Promise<PurchaseOrderProduct> {
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.updateProduct(id, productId, dto, userId);
  }

  @Delete(':id/products/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa sản phẩm khỏi đơn hàng PO' })
  @ApiResponse({ status: 204, description: 'Đã xóa sản phẩm khỏi PO' })
  @ApiResponse({ status: 400, description: 'PO đã khóa' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy sản phẩm' })
  async removeProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Req() req?: any,
  ): Promise<void> {
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.removeProduct(id, productId, userId);
  }

  // ─── Documents & History Endpoints ──────────────────────────────────────────

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

  @Patch(':id/documents/:documentId')
  @ApiOperation({ summary: 'Cập nhật phân loại tài liệu trong PO' })
  @ApiResponse({ status: 200, description: 'Đã cập nhật phân loại tài liệu' })
  @ApiResponse({
    status: 400,
    description: 'PO đã khóa hoặc mục đích sử dụng không hợp lệ',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy PO hoặc tài liệu' })
  async updateDocumentPurpose(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: UpdatePoDocumentDto,
    @Req() req?: any,
  ): Promise<PurchaseOrderDetailResponse> {
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.updateDocumentPurpose(
      id,
      documentId,
      dto.purpose,
      userId,
    );
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

  @Post(':id/documents/upload')
  @ApiOperation({ summary: 'Tải lên và đính kèm tệp tài liệu vào PO' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 201,
    description: 'Đã tải lên và đính kèm tài liệu vào PO',
  })
  @ApiResponse({ status: 400, description: 'PO đã khóa hoặc thiếu tệp' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: any,
    @Query('purpose') purpose: string = 'other',
    @Req() req?: any,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn tệp để tải lên');
    }
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.uploadDocument(id, file, purpose, userId);
  }

  @Post(':id/documents/upload-multiple')
  @ApiOperation({ summary: 'Tải lên nhiều tệp tài liệu cùng lúc vào PO' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 201,
    description: 'Đã tải lên danh sách tài liệu vào PO',
  })
  @ApiResponse({ status: 400, description: 'PO đã khóa hoặc thiếu tệp' })
  @UseInterceptors(FilesInterceptor('files'))
  async uploadMultipleDocuments(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files?: any[],
    @Query('purpose') purpose: string = 'other',
    @Req() req?: any,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất một tệp để tải lên');
    }
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.uploadMultipleDocuments(id, files, purpose, userId);
  }

  @Get(':id/documents/:documentId/preview')
  @ApiOperation({ summary: 'Xem trước nội dung tài liệu đính kèm PO' })
  @ApiResponse({ status: 200, description: 'Nội dung xem trước của tài liệu' })
  async previewDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<PoDocumentPreviewResponse> {
    return this.service.previewDocument(id, documentId);
  }
}
