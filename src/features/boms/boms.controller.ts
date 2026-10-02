import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Param,
  Body,
  Query,
  Req,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Auth } from '../../common/decorators/auth.decorator';
import { BomsService, PaginatedResult } from './boms.service';
import {
  QueryBomsDto,
  QueryBomStatsDto,
  BomListItemDto,
  BomDetailDto,
  BomStatsDto,
  CreateBomDto,
  UpdateBomDto,
  DiscontinueBomDto,
  CreateBomLineDto,
  UpdateBomLineDto,
  ReorderBomLinesDto,
  DeleteBomLineDto,
  SaveBomLinesDto,
  SaveBomLinesResponseDto,
  SaveBomCostsDto,
  PromoteRevisionDto,
  BomLineResponseDto,
  ForwardBomDto,
  RejectBomDto,
  ApproveBomDto,
  CreateRevisionDto,
  RevisionListItemDto,
  RevisionDetailDto,
  RevisionDiffDto,
  CopyFitToPoDto,
  QueryBomAggregateDto,
  BomAggregateItemDto,
} from './dto';
import { BomAggregateService } from './bom-aggregate.service';
import { PurchaseOrderBomWriteAccessGuard } from './guards/purchase-order-bom-write-access.guard';
import { QueryBomCreateTargetsDto } from './dto/query-bom-create-targets.dto';

@ApiTags('boms')
@ApiBearerAuth()
@Auth()
@Controller(['boms', 'api/boms', 'api/v1/boms'])
export class BomsController {
  constructor(
    private readonly bomsService: BomsService,
    private readonly bomAggregateService: BomAggregateService,
  ) {}

  @Post()
  @UseGuards(PurchaseOrderBomWriteAccessGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Khởi tạo NPL mới (Fit NPL hoặc PO NPL)' })
  @ApiResponse({
    status: 201,
    description: 'NPL đã được tạo thành công với Revision 1 (wait_nvkh)',
  })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
  @ApiResponse({ status: 403, description: 'Không có quyền tạo NPL' })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy Style hoặc PO Product',
  })
  @ApiResponse({
    status: 409,
    description: 'NPL đã tồn tại cho Style hoặc PO Product',
  })
  async create(
    @Body() dto: CreateBomDto,
    @Req() req?: any,
  ): Promise<BomDetailDto> {
    const userId = req?.user?.id || req?.user?.sub;
    const roleCode = req?.user?.roleCode;
    return this.bomsService.create(dto, userId, roleCode);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Thống kê số lượng NPL theo các nấc trạng thái' })
  @ApiResponse({
    status: 200,
    description: 'Thống kê số lượng NPL',
  })
  async getStats(@Query() query: QueryBomStatsDto): Promise<BomStatsDto> {
    return this.bomsService.getStats(query);
  }

  @Get('create-targets/po')
  @ApiOperation({ summary: 'PO còn sản phẩm đủ điều kiện tạo NPL' })
  async getEligiblePurchaseOrders(@Query() query: QueryBomCreateTargetsDto) {
    return this.bomsService.getEligiblePurchaseOrders(query);
  }

  @Get('create-targets/fit')
  @ApiOperation({ summary: 'Mẫu Fit chưa có NPL' })
  async getEligibleFitStyles(@Query() query: QueryBomCreateTargetsDto) {
    return this.bomsService.getEligibleFitStyles(query);
  }

  @Get('create-targets/po/:poId/products')
  @ApiOperation({ summary: 'Sản phẩm PO chưa có NPL và còn có thể tạo NPL' })
  async getEligiblePoProducts(@Param('poId', ParseUUIDPipe) poId: string) {
    return this.bomsService.getEligiblePoProducts(poId);
  }

  @Get()
  @ApiOperation({
    summary:
      'Lấy danh sách NPL (phân trang, lọc theo type, status, mã PO, style/sản phẩm)',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách NPL phân trang',
  })
  async findAll(
    @Query() query: QueryBomsDto,
    @Req() req?: any,
  ): Promise<PaginatedResult<BomListItemDto>> {
    const roleCode = req?.user?.roleCode;
    return this.bomsService.findAll(query, roleCode);
  }

  @Get('aggregate')
  @ApiOperation({
    summary:
      'Tổng hợp nhu cầu nguyên phụ liệu (NPL Aggregate) từ các PO NPL đã duyệt (closed)',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách tổng hợp NPL phân trang kèm phân rã màu/size',
  })
  async aggregate(
    @Query() query: QueryBomAggregateDto,
    @Req() req?: any,
  ): Promise<PaginatedResult<BomAggregateItemDto>> {
    const roleCode = req?.user?.roleCode;
    return this.bomAggregateService.aggregate(query, roleCode);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Lấy chi tiết NPL kèm thông tin live PO/Product, working revision, danh sách vật tư và chi phí',
  })
  @ApiResponse({
    status: 200,
    description: 'Chi tiết NPL',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy NPL',
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req?: any,
  ): Promise<BomDetailDto> {
    const roleCode = req?.user?.roleCode;
    return this.bomsService.findOne(id, roleCode);
  }

  @Patch(':id')
  @UseGuards(PurchaseOrderBomWriteAccessGuard)
  @ApiOperation({ summary: 'Cập nhật thông tin header NPL (deadline, rdNote)' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ hoặc NPL đã ngừng sử dụng',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền sửa trường tương ứng',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy NPL' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBomDto,
    @Req() req?: any,
  ): Promise<BomDetailDto> {
    const userId = req?.user?.id || req?.user?.sub;
    const roleCode = req?.user?.roleCode;
    return this.bomsService.update(id, dto, userId, roleCode);
  }

  @Post(':id/discontinue')
  @UseGuards(PurchaseOrderBomWriteAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ngừng sử dụng NPL (Discontinue)' })
  @ApiResponse({ status: 200, description: 'NPL đã ngừng sử dụng' })
  @ApiResponse({
    status: 400,
    description: 'Lý do rỗng hoặc NPL đã ngừng sử dụng',
  })
  @ApiResponse({ status: 403, description: 'Không có quyền ngừng sử dụng NPL' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy NPL' })
  async discontinue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DiscontinueBomDto,
    @Req() req?: any,
  ): Promise<BomDetailDto> {
    const userId = req?.user?.id || req?.user?.sub;
    const roleCode = req?.user?.roleCode;
    return this.bomsService.discontinue(id, dto, userId, roleCode);
  }

  @Post(':id/lines')
  @UseGuards(PurchaseOrderBomWriteAccessGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Thêm dòng vật tư mới vào working revision của NPL',
    deprecated: true,
  })
  @ApiResponse({
    status: 201,
    description: 'Thêm dòng vật tư thành công',
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ hoặc NPL/Revision đã đóng/ngừng sử dụng',
  })
  @ApiResponse({ status: 403, description: 'Không có quyền thêm dòng vật tư' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy NPL hoặc vật tư' })
  @ApiResponse({
    status: 409,
    description: 'Vật tư đã tồn tại trong revision này',
  })
  async addLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBomLineDto,
    @Req() req?: any,
  ): Promise<BomLineResponseDto> {
    const userId = req?.user?.id || req?.user?.sub;
    const roleCode = req?.user?.roleCode;
    return this.bomsService.addLine(id, dto, userId, roleCode);
  }

  @Put(':id/lines')
  @UseGuards(PurchaseOrderBomWriteAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Lưu toàn bộ bảng dòng vật tư của working revision (thêm/sửa/xoá/đổi thứ tự trong 1 lần)',
  })
  @ApiResponse({ status: 200, description: 'Lưu bảng dòng thành công' })
  @ApiResponse({ status: 400, description: 'Bảng có dòng không hợp lệ' })
  @ApiResponse({ status: 403, description: 'Không có quyền sửa bảng dòng' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy NPL hoặc vật tư' })
  async saveLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveBomLinesDto,
    @Req() req?: any,
  ): Promise<SaveBomLinesResponseDto> {
    const userId = req?.user?.id || req?.user?.sub;
    const roleCode = req?.user?.roleCode;
    return this.bomsService.saveLines(id, dto, userId, roleCode);
  }

  @Patch(':id/lines/costs')
  @UseGuards(PurchaseOrderBomWriteAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kế toán lưu đơn giá nhiều dòng vật tư ở bước wait_accounting',
  })
  @ApiResponse({ status: 200, description: 'Lưu đơn giá thành công' })
  @ApiResponse({ status: 403, description: 'Không có quyền nhập đơn giá' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy NPL hoặc dòng' })
  async saveCosts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveBomCostsDto,
    @Req() req?: any,
  ): Promise<SaveBomLinesResponseDto> {
    const userId = req?.user?.id || req?.user?.sub;
    const roleCode = req?.user?.roleCode;
    return this.bomsService.saveCosts(id, dto, userId, roleCode);
  }

  @Put(':id/lines/reorder')
  @UseGuards(PurchaseOrderBomWriteAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sắp xếp lại thứ tự các dòng vật tư trong working revision',
    deprecated: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Sắp xếp thứ tự thành công',
  })
  @ApiResponse({
    status: 400,
    description: 'Danh sách không hợp lệ hoặc trùng lặp',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền sắp xếp lại thứ tự',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy NPL hoặc dòng vật tư',
  })
  async reorderLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderBomLinesDto,
    @Req() req?: any,
  ): Promise<BomLineResponseDto[]> {
    const userId = req?.user?.id || req?.user?.sub;
    const roleCode = req?.user?.roleCode;
    return this.bomsService.reorderLines(id, dto, userId, roleCode);
  }

  @Patch(':id/lines/:lineId')
  @UseGuards(PurchaseOrderBomWriteAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cập nhật thông tin dòng vật tư trong working revision',
    deprecated: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Cập nhật dòng vật tư thành công',
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ hoặc NPL/Revision đã đóng/ngừng sử dụng',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền chỉnh sửa trường tương ứng',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy NPL hoặc dòng vật tư',
  })
  @ApiResponse({ status: 409, description: 'Vật tư mới bị trùng lặp' })
  async updateLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: UpdateBomLineDto,
    @Req() req?: any,
  ): Promise<BomLineResponseDto> {
    const userId = req?.user?.id || req?.user?.sub;
    const roleCode = req?.user?.roleCode;
    return this.bomsService.updateLine(id, lineId, dto, userId, roleCode);
  }

  @Delete(':id/lines/:lineId')
  @UseGuards(PurchaseOrderBomWriteAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Xóa dòng vật tư khỏi working revision',
    deprecated: true,
  })
  @ApiResponse({ status: 200, description: 'Xóa dòng vật tư thành công' })
  @ApiResponse({
    status: 400,
    description: 'NPL hoặc revision đã đóng/ngừng sử dụng',
  })
  @ApiResponse({ status: 403, description: 'Không có quyền xóa dòng vật tư' })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy NPL hoặc dòng vật tư',
  })
  async deleteLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: DeleteBomLineDto,
    @Req() req?: any,
  ): Promise<{ success: boolean; message: string }> {
    const userId = req?.user?.id || req?.user?.sub;
    const roleCode = req?.user?.roleCode;
    return this.bomsService.deleteLine(id, lineId, dto, userId, roleCode);
  }

  @Post(':id/forward')
  @UseGuards(PurchaseOrderBomWriteAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Chuyển NPL sang bước tiếp theo trong quy trình workflow',
  })
  @ApiResponse({
    status: 200,
    description: 'Chuyển bước thành công',
  })
  @ApiResponse({
    status: 400,
    description:
      'Chuyển bước sai tuần tự hoặc NPL/Revision đã đóng/ngừng sử dụng',
  })
  @ApiResponse({
    status: 403,
    description: 'Vai trò người dùng không có quyền forward tại trạng thái này',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy NPL' })
  async forward(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ForwardBomDto,
    @Req() req?: any,
  ): Promise<BomDetailDto> {
    const userId = req?.user?.id || req?.user?.sub;
    const roleCode = req?.user?.roleCode;
    return this.bomsService.forward(id, dto, userId, roleCode);
  }

  @Post(':id/reject')
  @UseGuards(PurchaseOrderBomWriteAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Từ chối / trả lại NPL về các bước trước trong quy trình workflow',
  })
  @ApiResponse({
    status: 200,
    description: 'Trả lại NPL thành công',
  })
  @ApiResponse({
    status: 400,
    description:
      'Trạng thái đích không hợp lệ, lý do rỗng hoặc NPL/Revision đã đóng/ngừng sử dụng',
  })
  @ApiResponse({
    status: 403,
    description: 'Vai trò người dùng không có quyền reject tại trạng thái này',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy NPL' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectBomDto,
    @Req() req?: any,
  ): Promise<BomDetailDto> {
    const userId = req?.user?.id || req?.user?.sub;
    const roleCode = req?.user?.roleCode;
    return this.bomsService.reject(id, dto, userId, roleCode);
  }

  @Post(':id/approve')
  @UseGuards(PurchaseOrderBomWriteAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Phê duyệt đóng NPL (chỉ dành cho Quản trị hệ thống SA tại wait_sa_approve)',
  })
  @ApiResponse({
    status: 200,
    description: 'Phê duyệt đóng NPL thành công (status = closed)',
  })
  @ApiResponse({
    status: 400,
    description:
      'NPL không ở trạng thái wait_sa_approve hoặc NPL đã đóng/ngừng sử dụng',
  })
  @ApiResponse({
    status: 403,
    description: 'Chỉ Quản trị hệ thống (SA) mới có quyền phê duyệt đóng NPL',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy NPL' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveBomDto,
    @Req() req?: any,
  ): Promise<BomDetailDto> {
    const userId = req?.user?.id || req?.user?.sub;
    const roleCode = req?.user?.roleCode;
    return this.bomsService.approve(id, dto, userId, roleCode);
  }

  @Post(':id/revisions')
  @UseGuards(PurchaseOrderBomWriteAccessGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Tạo revision mới từ revision đã đóng (closed)',
  })
  @ApiResponse({
    status: 201,
    description: 'Tạo revision mới thành công với status wait_nvkh',
  })
  @ApiResponse({
    status: 400,
    description:
      'Lý do rỗng hoặc revision hiện tại chưa đóng hoặc NPL đã ngừng sử dụng',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền tạo revision mới',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy NPL' })
  @ApiResponse({ status: 409, description: 'Revision number bị trùng lặp' })
  async createRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRevisionDto,
    @Req() req?: any,
  ): Promise<BomDetailDto> {
    const userId = req?.user?.id || req?.user?.sub;
    const roleCode = req?.user?.roleCode;
    return this.bomsService.createRevision(id, dto, userId, roleCode);
  }

  @Post(':id/revisions/:revisionId/promote')
  @UseGuards(PurchaseOrderBomWriteAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'SA đổi phiên bản hiện hành của NPL về một phiên bản khác',
  })
  @ApiResponse({ status: 200, description: 'Đã đổi phiên bản hiện hành' })
  @ApiResponse({
    status: 400,
    description: 'Lý do rỗng hoặc đã là bản hiện hành',
  })
  @ApiResponse({
    status: 403,
    description: 'Chỉ SA được đổi phiên bản hiện hành',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy NPL hoặc phiên bản',
  })
  async promoteRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: PromoteRevisionDto,
    @Req() req?: any,
  ): Promise<BomDetailDto> {
    const userId = req?.user?.id || req?.user?.sub;
    const roleCode = req?.user?.roleCode;
    return this.bomsService.promoteRevision(
      id,
      revisionId,
      dto,
      userId,
      roleCode,
    );
  }

  @Get(':id/revisions')
  @ApiOperation({
    summary: 'Lấy danh sách các phiên bản (revisions) của NPL',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách các revision của NPL sắp xếp mới nhất lên đầu',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy NPL' })
  async getRevisions(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RevisionListItemDto[]> {
    return this.bomsService.getRevisions(id);
  }

  @Get(':id/revisions/:revisionId')
  @ApiOperation({
    summary:
      'Lấy chi tiết một phiên bản (revision) kèm danh sách dòng vật tư và chi phí',
  })
  @ApiResponse({
    status: 200,
    description: 'Chi tiết revision',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy NPL hoặc revision' })
  async getRevisionDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Req() req?: any,
  ): Promise<RevisionDetailDto> {
    const roleCode = req?.user?.roleCode;
    return this.bomsService.getRevisionDetail(id, revisionId, roleCode);
  }

  @Get(':id/revisions/:revisionId/history')
  @ApiOperation({
    summary: 'Lấy lịch sử workflow của một revision',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách các bước chuyển trạng thái của revision',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy NPL hoặc revision' })
  async getRevisionHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
  ): Promise<any[]> {
    return this.bomsService.getRevisionHistory(id, revisionId);
  }

  @Get(':id/revisions/:revisionId/diff')
  @ApiOperation({
    summary:
      'So sánh thay đổi giữa revision hiện tại với revision nguồn (hoặc revision chỉ định)',
  })
  @ApiResponse({
    status: 200,
    description: 'Chi tiết so sánh (ADDED, REMOVED, CHANGED, UNCHANGED)',
  })
  @ApiResponse({ status: 400, description: 'Không thể so sánh diff' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy NPL hoặc revision' })
  async getRevisionDiff(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Query('compareWithRevisionId') compareWithRevisionId?: string,
    @Req() req?: any,
  ): Promise<RevisionDiffDto> {
    const roleCode = req?.user?.roleCode;
    return this.bomsService.getRevisionDiff(
      id,
      revisionId,
      compareWithRevisionId,
      roleCode,
    );
  }

  @Post(':id/copy-from-fit')
  @UseGuards(PurchaseOrderBomWriteAccessGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Sao chép cấu trúc vật tư từ một phiên bản đóng (closed) của Fit NPL sang PO NPL hiện tại (wait_nvkh)',
  })
  @ApiResponse({
    status: 200,
    description: 'Sao chép thành công cấu trúc vật tư sang PO NPL',
  })
  @ApiResponse({
    status: 400,
    description:
      'Dữ liệu không hợp lệ, NPL không phải loại PO, hoặc trạng thái revision không hợp lệ',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền sao chép Fit NPL sang PO NPL',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy PO NPL hoặc Fit NPL nguồn',
  })
  @ApiResponse({
    status: 409,
    description: 'Xung đột: PO NPL hiện tại đã có dòng vật tư (chống ghi đè)',
  })
  async copyFromFit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CopyFitToPoDto,
    @Req() req?: any,
  ): Promise<BomDetailDto> {
    const userId = req?.user?.id;
    const roleCode = req?.user?.roleCode;
    return this.bomsService.copyFromFit(id, dto, userId, roleCode);
  }
}
