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
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Khởi tạo BOM mới (Fit BOM hoặc PO BOM)' })
  @ApiResponse({
    status: 201,
    description: 'BOM đã được tạo thành công với Revision 1 (wait_nvkh)',
  })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
  @ApiResponse({ status: 403, description: 'Không có quyền tạo BOM' })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy Style hoặc PO Product',
  })
  @ApiResponse({
    status: 409,
    description: 'BOM đã tồn tại cho Style hoặc PO Product',
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
  @ApiOperation({ summary: 'Thống kê số lượng BOM theo các nấc trạng thái' })
  @ApiResponse({
    status: 200,
    description: 'Thống kê số lượng BOM',
  })
  async getStats(@Query() query: QueryBomStatsDto): Promise<BomStatsDto> {
    return this.bomsService.getStats(query);
  }

  @Get()
  @ApiOperation({
    summary:
      'Lấy danh sách BOM (phân trang, lọc theo type, status, mã PO, style/sản phẩm)',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách BOM phân trang',
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
      'Tổng hợp nhu cầu nguyên phụ liệu (NPL Aggregate) từ các PO BOM đã duyệt (closed)',
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
      'Lấy chi tiết BOM kèm thông tin live PO/Product, working revision, danh sách vật tư và chi phí',
  })
  @ApiResponse({
    status: 200,
    description: 'Chi tiết BOM',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy BOM',
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req?: any,
  ): Promise<BomDetailDto> {
    const roleCode = req?.user?.roleCode;
    return this.bomsService.findOne(id, roleCode);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật thông tin header BOM (deadline, rdNote)' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ hoặc BOM đã ngừng sử dụng',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền sửa trường tương ứng',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy BOM' })
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ngừng sử dụng BOM (Discontinue)' })
  @ApiResponse({ status: 200, description: 'BOM đã ngừng sử dụng' })
  @ApiResponse({
    status: 400,
    description: 'Lý do rỗng hoặc BOM đã ngừng sử dụng',
  })
  @ApiResponse({ status: 403, description: 'Không có quyền ngừng sử dụng BOM' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy BOM' })
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
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Thêm dòng vật tư mới vào working revision của BOM',
  })
  @ApiResponse({
    status: 201,
    description: 'Thêm dòng vật tư thành công',
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ hoặc BOM/Revision đã đóng/ngừng sử dụng',
  })
  @ApiResponse({ status: 403, description: 'Không có quyền thêm dòng vật tư' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy BOM hoặc vật tư' })
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

  @Put(':id/lines/reorder')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sắp xếp lại thứ tự các dòng vật tư trong working revision',
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
    description: 'Không tìm thấy BOM hoặc dòng vật tư',
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cập nhật thông tin dòng vật tư trong working revision',
  })
  @ApiResponse({
    status: 200,
    description: 'Cập nhật dòng vật tư thành công',
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu không hợp lệ hoặc BOM/Revision đã đóng/ngừng sử dụng',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền chỉnh sửa trường tương ứng',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy BOM hoặc dòng vật tư',
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xóa dòng vật tư khỏi working revision' })
  @ApiResponse({ status: 200, description: 'Xóa dòng vật tư thành công' })
  @ApiResponse({
    status: 400,
    description: 'BOM hoặc revision đã đóng/ngừng sử dụng',
  })
  @ApiResponse({ status: 403, description: 'Không có quyền xóa dòng vật tư' })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy BOM hoặc dòng vật tư',
  })
  async deleteLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Req() req?: any,
  ): Promise<{ success: boolean; message: string }> {
    const userId = req?.user?.id || req?.user?.sub;
    const roleCode = req?.user?.roleCode;
    return this.bomsService.deleteLine(id, lineId, userId, roleCode);
  }

  @Post(':id/forward')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Chuyển BOM sang bước tiếp theo trong quy trình workflow',
  })
  @ApiResponse({
    status: 200,
    description: 'Chuyển bước thành công',
  })
  @ApiResponse({
    status: 400,
    description:
      'Chuyển bước sai tuần tự hoặc BOM/Revision đã đóng/ngừng sử dụng',
  })
  @ApiResponse({
    status: 403,
    description: 'Vai trò người dùng không có quyền forward tại trạng thái này',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy BOM' })
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Từ chối / trả lại BOM về các bước trước trong quy trình workflow',
  })
  @ApiResponse({
    status: 200,
    description: 'Trả lại BOM thành công',
  })
  @ApiResponse({
    status: 400,
    description:
      'Trạng thái đích không hợp lệ, lý do rỗng hoặc BOM/Revision đã đóng/ngừng sử dụng',
  })
  @ApiResponse({
    status: 403,
    description: 'Vai trò người dùng không có quyền reject tại trạng thái này',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy BOM' })
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Phê duyệt đóng BOM (chỉ dành cho Quản trị hệ thống SA tại wait_sa_approve)',
  })
  @ApiResponse({
    status: 200,
    description: 'Phê duyệt đóng BOM thành công (status = closed)',
  })
  @ApiResponse({
    status: 400,
    description:
      'BOM không ở trạng thái wait_sa_approve hoặc BOM đã đóng/ngừng sử dụng',
  })
  @ApiResponse({
    status: 403,
    description: 'Chỉ Quản trị hệ thống (SA) mới có quyền phê duyệt đóng BOM',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy BOM' })
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
      'Lý do rỗng hoặc revision hiện tại chưa đóng hoặc BOM đã ngừng sử dụng',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền tạo revision mới',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy BOM' })
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

  @Get(':id/revisions')
  @ApiOperation({
    summary: 'Lấy danh sách các phiên bản (revisions) của BOM',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách các revision của BOM sắp xếp mới nhất lên đầu',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy BOM' })
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
  @ApiResponse({ status: 404, description: 'Không tìm thấy BOM hoặc revision' })
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
  @ApiResponse({ status: 404, description: 'Không tìm thấy BOM hoặc revision' })
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
  @ApiResponse({ status: 404, description: 'Không tìm thấy BOM hoặc revision' })
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Sao chép cấu trúc vật tư từ một phiên bản đóng (closed) của Fit BOM sang PO BOM hiện tại (wait_nvkh)',
  })
  @ApiResponse({
    status: 200,
    description: 'Sao chép thành công cấu trúc vật tư sang PO BOM',
  })
  @ApiResponse({
    status: 400,
    description:
      'Dữ liệu không hợp lệ, BOM không phải loại PO, hoặc trạng thái revision không hợp lệ',
  })
  @ApiResponse({
    status: 403,
    description: 'Không có quyền sao chép Fit BOM sang PO BOM',
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy PO BOM hoặc Fit BOM nguồn',
  })
  @ApiResponse({
    status: 409,
    description: 'Xung đột: PO BOM hiện tại đã có dòng vật tư (chống ghi đè)',
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
