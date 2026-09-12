import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
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
import {
  QueryBomsDto,
  QueryBomDetailDto,
  PaginatedBomResponseDto,
  BomStatsDto,
  CreateRevisionDto,
  UpdateRevisionLinesDto,
  ApproveRevisionDto,
  WorkflowActionDto,
} from './dto';

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

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy thống kê tổng quan NPL theo tháng hoặc toàn thời gian',
  })
  @ApiResponse({
    status: 200,
    description: 'Thống kê NPL',
    type: BomStatsDto,
  })
  async getStats(@Query('period') period?: string): Promise<BomStatsDto> {
    return this.bomsService.getStats(period);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lấy chi tiết BOM theo ID' })
  @ApiResponse({ status: 200, description: 'Chi tiết BOM' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy BOM' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query?: QueryBomDetailDto,
    @Req() req?: any,
  ): Promise<any> {
    const user = req?.user;
    return this.bomsService.findOne(id, user, query);
  }

  @Get(':id/revisions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy danh sách tất cả các phiên bản (Revisions) của BOM / Style',
  })
  async listRevisions(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req?: any,
  ): Promise<any> {
    const user = req?.user;
    return this.bomsService.listRevisions(id, user);
  }

  @Post(':id/revisions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo Revision mới (Draft) cho BOM / Style' })
  async createRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRevisionDto,
    @Req() req?: any,
  ): Promise<any> {
    const user = req?.user;
    return this.bomsService.createRevision(id, dto, user);
  }

  @Post(':id/revisions/:revisionId/clone')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Sao chép Revision cụ thể thành Revision mới (Draft)',
  })
  async cloneRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: CreateRevisionDto,
    @Req() req?: any,
  ): Promise<any> {
    const user = req?.user;
    return this.bomsService.createRevision(
      id,
      { ...dto, cloneFromRevisionId: revisionId },
      user,
    );
  }

  @Put(':id/revisions/:revisionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Chỉnh sửa nội dung Revision (chỉ cho phép khi ở trạng thái Draft)',
  })
  async updateDraftRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: UpdateRevisionLinesDto,
    @Req() req?: any,
  ): Promise<any> {
    const user = req?.user;
    return this.bomsService.updateDraftRevision(id, revisionId, dto, user);
  }

  @Post(':id/revisions/:revisionId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi duyệt Revision (Draft -> In Review)' })
  async submitRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: WorkflowActionDto,
    @Req() req?: any,
  ): Promise<any> {
    const user = req?.user;
    return this.bomsService.submitRevisionForReview(id, revisionId, dto, user);
  }

  @Post(':id/revisions/:revisionId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Phê duyệt Revision (In Review -> Approved, tự động đóng effective_to của revision trước)',
  })
  async approveRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: ApproveRevisionDto,
    @Req() req?: any,
  ): Promise<any> {
    const user = req?.user;
    return this.bomsService.approveRevision(id, revisionId, dto, user);
  }

  @Post(':id/revisions/:revisionId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Từ chối duyệt Revision (In Review -> Draft)' })
  async rejectRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: WorkflowActionDto,
    @Req() req?: any,
  ): Promise<any> {
    const user = req?.user;
    return this.bomsService.rejectRevision(id, revisionId, dto, user);
  }

  @Post(':id/revisions/:revisionId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hủy bỏ Revision (Draft/In Review -> Cancelled)' })
  async cancelRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: WorkflowActionDto,
    @Req() req?: any,
  ): Promise<any> {
    const user = req?.user;
    return this.bomsService.cancelRevision(id, revisionId, dto, user);
  }
}
