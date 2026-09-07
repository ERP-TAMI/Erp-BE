import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Query,
  BadRequestException,
  Get,
  Param,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

interface UploadedFileStruct {
  fieldname?: string;
  originalname: string;
  encoding?: string;
  mimetype?: string;
  size: number;
  buffer: Buffer;
  filename?: string;
}

@ApiTags('uploads')
@Controller(['uploads', 'api/uploads', 'api/v1/uploads'])
export class UploadsController {
  @Post()
  @ApiOperation({ summary: 'Tải lên hình ảnh local' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Tải lên thành công' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file?: UploadedFileStruct,
    @Query('folder') folder: string = 'style-images',
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file để tải lên');
    }

    const cleanFolder = (folder || 'style-images').replace(
      /[^a-zA-Z0-9_-]/g,
      '',
    );

    const ext = (path.extname(file.originalname) || '').toLowerCase();
    const isImageFolder = ['style-images', 'sample-images', 'images'].includes(
      cleanFolder,
    );
    const maxSizeBytes = isImageFolder ? 10 * 1024 * 1024 : 20 * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      const limitMb = isImageFolder ? 10 : 20;
      throw new BadRequestException(
        `Dung lượng file vượt quá giới hạn tối đa ${limitMb}MB`,
      );
    }

    const dangerousExtensions = [
      '.exe',
      '.bat',
      '.sh',
      '.cmd',
      '.msi',
      '.vbs',
      '.scr',
      '.ps1',
    ];
    if (dangerousExtensions.includes(ext)) {
      throw new BadRequestException(
        `Định dạng file ${ext} không được hỗ trợ vì lý do bảo mật`,
      );
    }

    const uploadDir = path.join(process.cwd(), 'uploads', cleanFolder);
    if (!fs.existsSync(uploadDir)) {
      await fsPromises.mkdir(uploadDir, { recursive: true });
    }

    const fileExt = ext || '.png';
    const filename = `${randomUUID()}${fileExt}`;
    const filePath = path.join(uploadDir, filename);

    if (file.buffer) {
      await fsPromises.writeFile(filePath, file.buffer);
    }

    const fileUrl = `/uploads/${cleanFolder}/${filename}`;
    return {
      url: fileUrl,
      fileKey: `${cleanFolder}/${filename}`,
      fileUrl,
      filename,
      fileName: file.originalname,
      originalname: file.originalname,
      size: file.size,
      sizeMb: parseFloat((file.size / (1024 * 1024)).toFixed(3)),
    };
  }

  @Get(':folder/:filename')
  async getFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const cleanFolder = (folder || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const cleanFilename = path.basename(filename || '');
    const filePath = path.join(
      process.cwd(),
      'uploads',
      cleanFolder,
      cleanFilename,
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File không tồn tại');
    }
    return res.sendFile(filePath);
  }
}
