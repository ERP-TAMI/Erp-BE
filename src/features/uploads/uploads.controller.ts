import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { ApiTags, ApiOperation, ApiConsumes, ApiResponse } from '@nestjs/swagger';

const UPLOAD_DIR = join(process.cwd(), 'uploads');

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

@ApiTags('uploads')
@Controller(['uploads', 'api/uploads', 'api/v1/uploads'])
export class UploadsController {
  @Post()
  @ApiOperation({ summary: 'Tải lên hình ảnh local' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Tải lên thành công' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
      fileFilter: (_req: any, file: any, cb: any) => {
        if (!file.mimetype.match(/^image\/(jpeg|jpg|png|gif|webp)$/i)) {
          return cb(
            new BadRequestException(
              'Chỉ chấp nhận file hình ảnh (JPEG, PNG, GIF, WebP)',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadFile(@UploadedFile() file?: any) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file hình ảnh để tải lên');
    }

    let filename = file.filename;
    if (!filename) {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = extname(file.originalname || '').toLowerCase() || '.png';
      filename = `img-${uniqueSuffix}${ext}`;
      const filePath = join(UPLOAD_DIR, filename);
      if (file.buffer) {
        writeFileSync(filePath, file.buffer);
      }
    }

    const url = `/uploads/${filename}`;
    return {
      url,
      filename,
      originalname: file.originalname || filename,
      size: file.size || 0,
      mimetype: file.mimetype || 'image/png',
    };
  }
}
