import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StyleOperationStepsService } from './style-operation-steps.service';
import { StyleOperationStepsExportService } from './style-operation-steps-export.service';
import { StylesService } from './styles.service';
import {
  CreateStyleOperationStepDto,
  UpdateStyleOperationStepDto,
  BulkSaveStyleOperationStepsDto,
  ReorderStyleOperationStepsDto,
} from './dto/style-operation-step.dto';
import { StyleOperationStep } from './entities/StyleOperationStep.entity';

@ApiTags('styles')
@Controller([
  'styles/:styleId/operation-steps',
  'styles/:styleId/as3b',
  'api/styles/:styleId/operation-steps',
  'api/styles/:styleId/as3b',
  'api/v1/styles/:styleId/operation-steps',
  'api/v1/styles/:styleId/as3b',
])
export class StyleOperationStepsController {
  constructor(
    private readonly service: StyleOperationStepsService,
    private readonly exportService: StyleOperationStepsExportService,
    private readonly stylesService: StylesService,
  ) {}

  @Get(['export', 'export-template'])
  @ApiOperation({
    summary: 'Xuất file Excel quy trình công đoạn theo mẫu Template',
  })
  @ApiResponse({
    status: 200,
    description: 'File Excel (.xlsx) chứa dữ liệu quy trình công đoạn',
  })
  async exportExcel(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const style = await this.stylesService.findOne(styleId);
      const steps = await this.service.findByStyleId(styleId);

      const buffer = await this.exportService.buildExcelBuffer({
        styleCode: style.styleCode,
        styleName: style.styleName,
        category: style.category,
        material: null,
        imageUrl: style.baseImageVersionId,
        as3bCmBaseDays: style.as3bCmBaseDays ?? 30,
        steps,
      });

      const filename = `BangCongDoan_Style_${style.styleCode || styleId}.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.send(buffer);
    } catch (err: any) {
      console.error('Lỗi xuất Excel quy trình công đoạn:', err);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: 500,
        message: `Xuất Excel thất bại: ${err?.message || err}`,
      });
    }
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách công đoạn quy trình của mẫu Fit' })
  @ApiResponse({
    status: 200,
    description: 'Danh sách các công đoạn quy trình',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy mẫu Fit' })
  async findAll(
    @Param('styleId', ParseUUIDPipe) styleId: string,
  ): Promise<StyleOperationStep[]> {
    return this.service.findByStyleId(styleId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Thêm công đoạn quy trình cho mẫu Fit' })
  @ApiResponse({ status: 201, description: 'Đã tạo công đoạn mới' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy mẫu Fit' })
  async create(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Body() dto: CreateStyleOperationStepDto,
  ): Promise<StyleOperationStep> {
    return this.service.create(styleId, dto);
  }

  @Put()
  @ApiOperation({
    summary: 'Lưu / Thay thế toàn bộ danh sách công đoạn quy trình',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách công đoạn sau khi cập nhật',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy mẫu Fit' })
  async replaceAll(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Body() body: BulkSaveStyleOperationStepsDto,
  ): Promise<StyleOperationStep[]> {
    const steps = Array.isArray(body) ? body : body?.steps || [];
    const as3bCmBaseDays = Array.isArray(body)
      ? undefined
      : body?.as3bCmBaseDays;
    return this.service.createMany(styleId, steps, as3bCmBaseDays);
  }

  @Patch(':stepId')
  @ApiOperation({ summary: 'Cập nhật thông tin công đoạn quy trình' })
  @ApiResponse({ status: 200, description: 'Công đoạn đã được cập nhật' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy công đoạn' })
  async update(
    @Param('styleId', ParseUUIDPipe) _styleId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: UpdateStyleOperationStepDto,
  ): Promise<StyleOperationStep> {
    return this.service.update(stepId, dto);
  }

  @Delete(':stepId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa công đoạn quy trình' })
  @ApiResponse({ status: 204, description: 'Đã xóa công đoạn' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy công đoạn' })
  async remove(
    @Param('styleId', ParseUUIDPipe) _styleId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
  ): Promise<void> {
    return this.service.remove(stepId);
  }

  @Put('reorder')
  @ApiOperation({ summary: 'Sắp xếp lại thứ tự các công đoạn quy trình' })
  @ApiResponse({
    status: 200,
    description: 'Danh sách công đoạn đã được sắp xếp',
  })
  @ApiResponse({ status: 404, description: 'Không tìm thấy mẫu Fit' })
  async reorder(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Body() body: ReorderStyleOperationStepsDto,
  ): Promise<StyleOperationStep[]> {
    return this.service.reorder(styleId, body.orderedIds || []);
  }
}
