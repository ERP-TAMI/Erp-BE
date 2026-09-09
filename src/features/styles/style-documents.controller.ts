import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  StyleDocumentListItem,
  StyleDocumentsService,
  StyleDocumentViewUrlResult,
  PresignStyleDocumentResult,
} from './style-documents.service';
import { PresignStyleDocumentDto } from './dto/presign-style-document.dto';
import { ConfirmStyleDocumentDto } from './dto/confirm-style-document.dto';

@ApiTags('style-documents')
@Controller('styles/:styleId/documents')
export class StyleDocumentsController {
  constructor(private readonly service: StyleDocumentsService) {}

  @Post('presign')
  @ApiOperation({ summary: 'Xin presigned URL để upload tài liệu vào mẫu Fit' })
  async presign(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Body() dto: PresignStyleDocumentDto,
  ): Promise<PresignStyleDocumentResult> {
    return this.service.presign(styleId, dto);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Xác nhận đã upload xong, ghi tài liệu vào mẫu Fit',
  })
  async confirm(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Body() dto: ConfirmStyleDocumentDto,
    @Req() req?: any,
  ): Promise<StyleDocumentListItem> {
    const userId = req?.user?.id || req?.user?.sub;
    return this.service.confirm(styleId, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách tài liệu đính kèm mẫu Fit' })
  async list(
    @Param('styleId', ParseUUIDPipe) styleId: string,
  ): Promise<StyleDocumentListItem[]> {
    return this.service.list(styleId);
  }

  @Get(':documentId/view-url')
  @ApiOperation({ summary: 'Lấy URL xem/tải tài liệu' })
  async getViewUrl(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query('download') download?: string,
  ): Promise<StyleDocumentViewUrlResult> {
    return this.service.getViewUrl(styleId, documentId, download === 'true');
  }

  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Gỡ tài liệu khỏi mẫu Fit (không xoá file gốc)' })
  async remove(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<void> {
    return this.service.remove(styleId, documentId);
  }
}
