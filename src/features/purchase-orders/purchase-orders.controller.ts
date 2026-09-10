import * as path from 'path';
import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
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
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Auth } from '../../common/decorators/auth.decorator';
import { DocumentPurpose, ProductStatus } from '../../common/enums/database.enums';
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
  SaveProductOperationStepsDto,
  CreateProductSampleRoundDto,
} from './dto';
import { PurchaseOrder } from './entities/PurchaseOrder.entity';
import { PurchaseOrderProduct } from './entities/PurchaseOrderProduct.entity';
import { PurchaseOrderStatusHistory } from './entities/PurchaseOrderStatusHistory.entity';

export const ALLOWED_PO_MIME_BY_EXTENSION: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/octet-stream',
    'application/x-zip-compressed',
  ],
  '.doc': ['application/msword'],
  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/octet-stream',
    'application/x-zip-compressed',
  ],
  '.xls': ['application/vnd.ms-excel'],
  '.csv': [
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/csv',
    'text/x-csv',
  ],
  '.txt': ['text/plain'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.webp': ['image/webp'],
  '.gif': ['image/gif'],
};

export const poDocumentFileFilter = (
  _req: any,
  file: any,
  callback: (error: Error | null, acceptFile: boolean) => void,
) => {
  const ext = (
    file?.originalname ? path.extname(file.originalname) : ''
  ).toLowerCase();
  const rawMime = (file?.mimetype || '').toLowerCase();
  const cleanMime = rawMime.split(';')[0].trim();

  const allowedMimes = ALLOWED_PO_MIME_BY_EXTENSION[ext];
  if (!allowedMimes) {
    return callback(
      new BadRequestException(
        `Định dạng phần mở rộng "${ext || 'không có'}" không được hỗ trợ. Chỉ chấp nhận các định dạng: ${Object.keys(ALLOWED_PO_MIME_BY_EXTENSION).join(', ')}.`,
      ),
      false,
    );
  }

  if (!allowedMimes.includes(cleanMime)) {
    return callback(
      new BadRequestException(
        `Loại MIME "${rawMime}" không hợp lệ cho tệp "${ext}". Chỉ chấp nhận: ${allowedMimes.join(', ')}.`,
      ),
      false,
    );
  }

  callback(null, true);
};

@ApiTags('purchase-orders')
@ApiBearerAuth()
@Auth()
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

  @Get('import-fit-preview/:styleId')
  @ApiOperation({ summary: 'Xem trước dữ liệu Fit sẽ import vào Product' })
  @ApiResponse({ status: 200, description: 'Bản xem trước dữ liệu import' })
  async getImportFitPreview(
    @Param('styleId', ParseUUIDPipe) styleId: string,
  ) {
    return this.service.getImportFitPreview(styleId);
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
  ) {
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

  @Get(':id/products/:productId')
  @ApiOperation({ summary: 'Lấy chi tiết sản phẩm và toàn bộ dữ liệu con' })
  @ApiResponse({ status: 200, description: 'Chi tiết sản phẩm' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy sản phẩm' })
  async getProductDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.service.getProductDetail(id, productId);
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
  ): Promise<void> {
    return this.service.removeProduct(id, productId);
  }

  @Patch(':id/products/:productId/status')
  @ApiOperation({ summary: 'Cập nhật trạng thái sản phẩm PO' })
  @ApiResponse({ status: 200, description: 'Đã cập nhật trạng thái sản phẩm' })
  async updateProductStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() body: { status: ProductStatus; reason?: string },
    @Req() req?: any,
  ) {
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.updateProductStatus(
      id,
      productId,
      body.status,
      body.reason,
      userId,
    );
  }

  // ─── Product Sub-resources Endpoints ────────────────────────────────────────

  @Get(':id/products/:productId/operation-steps')
  @ApiOperation({ summary: 'Lấy bảng công đoạn của sản phẩm' })
  async getProductOperationSteps(
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.service.getProductOperationSteps(productId);
  }

  @Put(':id/products/:productId/operation-steps')
  @ApiOperation({ summary: 'Lưu bảng công đoạn của sản phẩm' })
  async saveProductOperationSteps(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: SaveProductOperationStepsDto,
    @Req() req?: any,
  ) {
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.saveProductOperationSteps(productId, dto, userId);
  }

  @Get(':id/products/:productId/sample-rounds')
  @ApiOperation({ summary: 'Lấy danh sách đợt may mẫu của sản phẩm' })
  async getProductSampleRounds(
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.service.getProductSampleRounds(productId);
  }

  @Post(':id/products/:productId/sample-rounds')
  @ApiOperation({ summary: 'Tạo đợt may mẫu mới cho sản phẩm' })
  async createProductSampleRound(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateProductSampleRoundDto,
    @Req() req?: any,
  ) {
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.createProductSampleRound(productId, dto, userId);
  }

  @Get(':id/products/:productId/production-doc')
  @ApiOperation({ summary: 'Lấy tài liệu sản xuất tiếng Việt của sản phẩm' })
  async getProductProductionDoc(
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.service.getProductProductionDoc(productId);
  }

  @Patch(':id/products/:productId/production-doc')
  @ApiOperation({ summary: 'Cập nhật tài liệu sản xuất tiếng Việt của sản phẩm' })
  async updateProductProductionDoc(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: any,
    @Req() req?: any,
  ) {
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.updateProductProductionDoc(productId, dto, userId);
  }

  @Post(':id/products/:productId/documents/:documentId')
  @ApiOperation({ summary: 'Gán tài liệu từ PO vào sản phẩm (kéo thả)' })
  async linkProductDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query('purpose') purpose?: string,
    @Body() body?: { purpose?: string },
    @Req() req?: any,
  ) {
    const targetPurpose = (body?.purpose || purpose) as DocumentPurpose | undefined;
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.linkProductDocument(
      id,
      productId,
      documentId,
      userId,
      targetPurpose,
    );
  }

  @Patch(':id/products/:productId/documents/:documentId/purpose')
  @ApiOperation({ summary: 'Cập nhật mục (PO Chi Tiết, TechPack, Khác) của tài liệu sản phẩm' })
  async updateProductDocumentPurpose(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body('purpose') purpose: string,
  ) {
    return this.service.updateProductDocumentPurpose(
      id,
      productId,
      documentId,
      purpose as DocumentPurpose,
    );
  }

  @Delete(':id/products/:productId/documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Hủy gán tài liệu khỏi sản phẩm' })
  async unlinkProductDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.service.unlinkProductDocument(id, productId, documentId);
  }

  @Post(':id/products/:productId/documents/upload')
  @ApiOperation({ summary: 'Tải lên tài liệu đính kèm trực tiếp cho sản phẩm' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: poDocumentFileFilter,
    }),
  )
  async uploadProductDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @UploadedFile() file?: any,
    @Query('purpose') purpose: string = 'other',
    @Req() req?: any,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn tệp để tải lên');
    }
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.uploadProductDocument(
      id,
      productId,
      file,
      purpose,
      userId,
    );
  }

  @Post(':id/products/:productId/documents/:documentId/versions')
  @ApiOperation({ summary: 'Cập nhật phiên bản mới cho tài liệu của sản phẩm' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: poDocumentFileFilter,
    }),
  )
  async uploadProductDocumentVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @UploadedFile() file?: any,
    @Body('changeReason') changeReason?: string,
    @Req() req?: any,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn tệp để tải lên');
    }
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.uploadDocumentVersion(
      id,
      productId,
      documentId,
      file,
      changeReason,
      userId,
    );
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
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: poDocumentFileFilter,
    }),
  )
  async uploadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: any,
    @Query('purpose') purpose: string = 'other',
    @Req() req?: any,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn tệp để tải lên');
    }
    const validPurposes = Object.values(DocumentPurpose);
    const targetPurpose = (purpose || DocumentPurpose.OTHER) as DocumentPurpose;
    if (!validPurposes.includes(targetPurpose)) {
      throw new BadRequestException(
        `Mục đích sử dụng tài liệu không hợp lệ. Các giá trị hợp lệ: ${validPurposes.join(', ')}`,
      );
    }
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.uploadDocument(id, file, targetPurpose, userId);
  }

  @Post(':id/documents/upload-multiple')
  @ApiOperation({ summary: 'Tải lên nhiều tệp tài liệu cùng lúc vào PO' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 201,
    description: 'Đã tải lên danh sách tài liệu vào PO',
  })
  @ApiResponse({ status: 400, description: 'PO đã khóa hoặc thiếu tệp' })
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      limits: { fileSize: 25 * 1024 * 1024, files: 20 },
      fileFilter: poDocumentFileFilter,
    }),
  )
  async uploadMultipleDocuments(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files?: any[],
    @Query('purpose') purpose: string = 'other',
    @Req() req?: any,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất một tệp để tải lên');
    }
    const validPurposes = Object.values(DocumentPurpose);
    const targetPurpose = (purpose || DocumentPurpose.OTHER) as DocumentPurpose;
    if (!validPurposes.includes(targetPurpose)) {
      throw new BadRequestException(
        `Mục đích sử dụng tài liệu không hợp lệ. Các giá trị hợp lệ: ${validPurposes.join(', ')}`,
      );
    }
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.uploadMultipleDocuments(
      id,
      files,
      targetPurpose,
      userId,
    );
  }

  @Get(':id/documents/:documentId/preview')
  @ApiOperation({ summary: 'Xem trước nội dung tài liệu đính kèm PO' })
  @ApiResponse({ status: 200, description: 'Nội dung xem trước của tài liệu' })
  async previewDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query('versionId') versionId?: string,
  ): Promise<PoDocumentPreviewResponse> {
    return this.service.previewDocument(id, documentId, versionId);
  }
}
