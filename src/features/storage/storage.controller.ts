import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { Auth } from '../../common/decorators/auth.decorator';
import { assertAllowedFile } from '../../common/utils/file-validation';
import { PresignUploadDto, StorageEntityType } from './dto/presign-upload.dto';
import {
  PRESIGN_GET_EXPIRY_SECONDS,
  PRESIGN_PUT_EXPIRY_SECONDS,
  STORAGE_SERVICE,
  StorageService,
} from './storage.interface';

const ENTITY_TYPE_PATH: Record<StorageEntityType, string> = {
  [StorageEntityType.STYLE]: 'styles',
  [StorageEntityType.PURCHASE_ORDER]: 'purchase-orders',
};

@Auth()
@Controller('storage/uploads')
export class StorageController {
  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  @Post('presign')
  async presignUpload(@Body() dto: PresignUploadDto) {
    assertAllowedFile(dto.fileName, dto.mimeType, dto.sizeBytes);

    const ext = extname(dto.fileName).toLowerCase();
    const objectKey = `${ENTITY_TYPE_PATH[dto.entityType]}/${dto.entityId}/documents/${dto.purpose}/${randomUUID()}${ext}`;

    const uploadUrl = await this.storage.getPresignedPutUrl(
      objectKey,
      dto.mimeType,
      PRESIGN_PUT_EXPIRY_SECONDS,
    );

    return {
      objectKey,
      uploadUrl,
      expiresIn: PRESIGN_PUT_EXPIRY_SECONDS,
    };
  }

  @Get('view-url')
  async getViewUrl(
    @Query('objectKey') objectKey: string,
    @Query('download') download?: string,
    @Query('fileName') fileName?: string,
  ) {
    if (!objectKey) {
      throw new BadRequestException('objectKey không được để trống');
    }

    const url = await this.storage.getPresignedGetUrl(
      objectKey,
      PRESIGN_GET_EXPIRY_SECONDS,
      download === 'true'
        ? (fileName ?? objectKey.split('/').pop())
        : undefined,
    );

    return { url, expiresIn: PRESIGN_GET_EXPIRY_SECONDS };
  }

  @Delete()
  async deleteObject(@Query('objectKey') objectKey: string) {
    if (!objectKey) {
      throw new BadRequestException('objectKey không được để trống');
    }
    await this.storage.deleteObject(objectKey);
  }
}
