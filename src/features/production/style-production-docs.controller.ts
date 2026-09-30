import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  Res,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { StyleProductionDocsService } from './style-production-docs.service';
import { Auth } from '../../common/decorators/auth.decorator';
import {
  CreateStyleProductionDocDto,
  UpdateStyleProductionDocDto,
  UpdateProductionDocStatusDto,
  CopyProductionDocDto,
  ResyncProductionDocDto,
} from './dto';

@Auth()
@Controller('styles/:styleId/production-docs')
export class StyleProductionDocsController {
  constructor(private readonly service: StyleProductionDocsService) {}

  @Get()
  findByStyleId(@Param('styleId', ParseUUIDPipe) styleId: string) {
    return this.service.findByStyleId(styleId);
  }

  @Get('export-excel')
  async exportExcel(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buffer = await this.service.exportExcel(styleId);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Style_Production_Doc_${styleId}.xlsx"`,
    );
    return new StreamableFile(buffer);
  }

  @Post()
  create(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Body() dto: CreateStyleProductionDocDto,
    @Req() req?: any,
  ) {
    const userId = req?.user?.id || req?.user?.sub;
    const actor = userId
      ? { id: userId, roleCode: req?.user?.roleCode }
      : undefined;
    return this.service.createWithAutoFill(styleId, dto, userId, actor);
  }

  @Get(':docId')
  findOne(@Param('docId', ParseUUIDPipe) docId: string) {
    return this.service.findOne(docId);
  }

  @Patch(':docId')
  update(
    @Param('docId', ParseUUIDPipe) docId: string,
    @Body() dto: UpdateStyleProductionDocDto,
    @Req() req?: any,
  ) {
    const userId = req?.user?.id || req?.user?.sub;
    const actor = userId
      ? { id: userId, roleCode: req?.user?.roleCode }
      : undefined;
    return this.service.update(docId, dto, userId, actor);
  }

  @Patch(':docId/status')
  updateStatus(
    @Param('docId', ParseUUIDPipe) docId: string,
    @Body() dto: UpdateProductionDocStatusDto,
    @Req() req?: any,
  ) {
    const userId = req?.user?.id || req?.user?.sub;
    const actor = userId
      ? { id: userId, roleCode: req?.user?.roleCode }
      : undefined;
    return this.service.updateStatus(docId, dto.status, userId, actor);
  }

  @Post(':docId/resync')
  @HttpCode(HttpStatus.OK)
  resync(
    @Param('docId', ParseUUIDPipe) docId: string,
    @Body() dto: ResyncProductionDocDto,
  ) {
    return this.service.resync(docId, dto);
  }

  @Post(':docId/copy')
  @HttpCode(HttpStatus.OK)
  copyToStyle(
    @Param('docId', ParseUUIDPipe) docId: string,
    @Body() dto: CopyProductionDocDto,
  ) {
    return this.service.copyToStyle(
      docId,
      dto.targetStyleId,
      dto.mode,
      dto.excludeSections,
      undefined,
      dto.confirmOverwrite,
    );
  }

  @Post('attachments')
  @HttpCode(HttpStatus.OK)
  linkAttachment(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Body('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.service.linkAttachment(styleId, documentId);
  }

  @Delete('attachments/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unlinkAttachment(
    @Param('styleId', ParseUUIDPipe) styleId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.service.unlinkAttachment(styleId, documentId);
  }

  @Delete(':docId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('docId', ParseUUIDPipe) docId: string, @Req() req?: any) {
    const userId = req?.user?.id || req?.user?.sub;
    const actor = userId
      ? { id: userId, roleCode: req?.user?.roleCode }
      : undefined;
    return this.service.remove(docId, actor);
  }
}
