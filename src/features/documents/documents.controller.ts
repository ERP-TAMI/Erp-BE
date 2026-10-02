import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../../common/decorators/auth.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { AuditActor } from '../audit/audit-actor.type';
import {
  ConfirmDocumentVersionDto,
  ConfirmLibraryDocumentDto,
  DocumentFolderDto,
  DocumentFoldersQueryDto,
  DocumentLibraryQueryDto,
  PresignDocumentVersionDto,
  PresignLibraryDocumentDto,
} from './dto/document-library.dto';
import { DocumentsService } from './documents.service';

const VIEW_PERMISSION = 'master_data.documents.view';
const MANAGE_PERMISSION = 'master_data.documents.manage';

function getActor(req?: any): AuditActor {
  const id = req?.user?.id || req?.user?.sub;
  if (!id) throw new UnauthorizedException('Không xác định được người dùng.');
  return { id, roleCode: req?.user?.roleCode ?? 'unknown' };
}

@ApiTags('documents')
@ApiBearerAuth()
@Auth(VIEW_PERMISSION)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'Tìm tài liệu trong kho dùng chung' })
  list(@Query() query: DocumentLibraryQueryDto, @Req() req?: any) {
    return this.service.list(query, getActor(req).id);
  }

  @Put(':documentId/pin')
  @ApiOperation({ summary: 'Ghim tài liệu cho người dùng hiện tại' })
  async pin(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() req?: any,
  ): Promise<void> {
    await this.service.pin(documentId, getActor(req).id);
  }

  @Delete(':documentId/pin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bỏ ghim tài liệu cho người dùng hiện tại' })
  async unpin(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() req?: any,
  ): Promise<void> {
    await this.service.unpin(documentId, getActor(req).id);
  }

  @Get('folders')
  @ApiOperation({ summary: 'Danh sách thư mục tài liệu' })
  listFolders(@Query() query: DocumentFoldersQueryDto) {
    return this.service.listFolders(query);
  }

  @Post('folders')
  @Permission(MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Tạo thư mục tài liệu' })
  createFolder(@Body() dto: DocumentFolderDto, @Req() req?: any) {
    const actor = getActor(req);
    return this.service.createFolder(dto, actor.id);
  }

  @Patch('folders/:folderId')
  @Permission(MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Đổi tên hoặc di chuyển thư mục' })
  renameFolder(
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @Body() dto: DocumentFolderDto,
  ) {
    return this.service.renameFolder(folderId, dto);
  }

  @Delete('folders/:folderId')
  @Permission(MANAGE_PERMISSION)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa thư mục rỗng trong kho' })
  async deleteFolder(
    @Param('folderId', ParseUUIDPipe) folderId: string,
  ): Promise<void> {
    await this.service.deleteFolder(folderId);
  }

  @Post('upload/presign')
  @Permission(MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Xin URL upload tài liệu mới vào kho' })
  presignInitialUpload(@Body() dto: PresignLibraryDocumentDto) {
    return this.service.presignInitialUpload(dto);
  }

  @Post('upload/confirm')
  @Permission(MANAGE_PERMISSION)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Xác nhận upload xong và thêm tài liệu vào kho' })
  confirmInitialUpload(
    @Body() dto: ConfirmLibraryDocumentDto,
    @Req() req?: any,
  ) {
    const actor = getActor(req);
    return this.service.confirmInitialUpload(dto, actor.id, actor);
  }

  @Post(':documentId/versions/presign')
  @Permission(MANAGE_PERMISSION)
  @ApiOperation({ summary: 'Xin URL upload version mới cho tài liệu' })
  presignVersionUpload(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: PresignDocumentVersionDto,
  ) {
    return this.service.presignVersionUpload(documentId, dto);
  }

  @Post(':documentId/versions/confirm')
  @Permission(MANAGE_PERMISSION)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Lưu version mới cho tài liệu' })
  confirmVersionUpload(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: ConfirmDocumentVersionDto,
    @Req() req?: any,
  ) {
    const actor = getActor(req);
    return this.service.confirmVersionUpload(documentId, dto, actor.id, actor);
  }

  @Get(':documentId/versions')
  @ApiOperation({ summary: 'Lịch sử version của tài liệu' })
  listVersions(@Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.service.listVersions(documentId);
  }

  @Get(':documentId/view-url')
  @ApiOperation({ summary: 'Lấy URL xem hoặc tải tài liệu trong kho' })
  getViewUrl(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query('versionId') versionId?: string,
    @Query('download') download?: string,
  ) {
    return this.service.getViewUrl(documentId, versionId, download === 'true');
  }

  @Delete(':documentId')
  @Permission(MANAGE_PERMISSION)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Lưu trữ tài liệu khỏi kho (giữ nguyên file gốc)' })
  async archive(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() req?: any,
  ): Promise<void> {
    await this.service.archive(documentId, getActor(req));
  }
}
