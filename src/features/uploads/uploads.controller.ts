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
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Controller(['uploads', 'api/uploads', 'api/v1/uploads'])
export class UploadsController {
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: any,
    @Query('folder') folder: string = 'style-images',
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file ảnh để tải lên');
    }

    const cleanFolder = (folder || 'style-images').replace(
      /[^a-zA-Z0-9_-]/g,
      '',
    );
    const uploadDir = path.join(process.cwd(), 'uploads', cleanFolder);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const ext = path.extname(file.originalname) || '.png';
    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(uploadDir, filename);

    fs.writeFileSync(filePath, file.buffer);

    const fileUrl = `/uploads/${cleanFolder}/${filename}`;
    return {
      fileKey: `${cleanFolder}/${filename}`,
      fileUrl,
      fileName: file.originalname,
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
