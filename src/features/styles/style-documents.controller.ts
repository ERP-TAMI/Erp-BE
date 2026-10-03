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
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Auth } from '../../common/decorators/auth.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import {
  StyleDocumentListItem,
  StyleDocumentsService,
  StyleDocumentViewUrlResult,
  PresignStyleDocumentResult,
} from './style-documents.service';
import { PresignStyleDocumentDto } from './dto/presign-style-document.dto';
import { ConfirmStyleDocumentDto } from './dto/confirm-style-document.dto';
import { AssignLibraryDocumentsDto } from '../documents/dto/document-library.dto';

const VIEW_PERMISSION = 'master_data.styles.view';
const MANAGE_PERMISSION = 'master_data.styles.manage';
const ASSIGN_DOCUMENT_PERMISSION = 'master_data.documents.assign';

@ApiTags('style-documents')
@ApiBearerAuth()
@Auth(VIEW_PERMISSION)
@Controller('styles/:styleId/documents')
export class StyleDocumentsController {
  constructor(private readonly service: StyleDocumentsService) {}

  @Post('presign')
  @Permission(MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Xin presigned URL để upload tài liệu vào mẫu Fit' })
  async presign(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Body() dto: PresignStyleDocumentDto,
  ): Promise<PresignStyleDocumentResult> {
    return this.service.presign(styleId, dto);
  }

  @Post('confirm')
  @Permission(MANAGE_PERMISSION)
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
    const actor = userId
      ? { id: userId, roleCode: req?.user?.roleCode }
      : undefined;
    return this.service.confirm(styleId, userId, dto, actor);
  }

  @Post('from-library')
  @Permission(ASSIGN_DOCUMENT_PERMISSION)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Gán tài liệu trong kho dùng chung vào mẫu Fit' })
  async assignFromLibrary(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Body() dto: AssignLibraryDocumentsDto,
    @Req() req?: any,
  ): Promise<StyleDocumentListItem[]> {
    const userId = req?.user?.id || req?.user?.sub;
    if (!userId)
      throw new UnauthorizedException('Không xác định được người dùng.');
    const actor = { id: userId, roleCode: req?.user?.roleCode ?? 'unknown' };
    return this.service.assignFromLibrary(styleId, dto.documentIds, actor);
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
  @Permission(MANAGE_PERMISSION)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Gỡ tài liệu khỏi mẫu Fit (không xoá file gốc)' })
  async remove(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() req?: any,
  ): Promise<void> {
    const userId = req?.user?.id || req?.user?.sub;
    const actor = userId
      ? { id: userId, roleCode: req?.user?.roleCode }
      : undefined;
    return this.service.remove(styleId, documentId, actor);
  }
}
