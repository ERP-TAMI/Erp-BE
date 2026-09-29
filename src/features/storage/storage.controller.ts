import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { Style } from '../styles/entities/Style.entity';
import { PurchaseOrder } from '../purchase-orders/entities/PurchaseOrder.entity';
import { PurchaseOrderUploadWriteAccessGuard } from './guards/purchase-order-upload-write-access.guard';
import { PurchaseOrderDownloadAccessGuard } from './guards/purchase-order-download-access.guard';

const ENTITY_TYPE_PATH: Record<StorageEntityType, string> = {
  [StorageEntityType.STYLE]: 'styles',
  [StorageEntityType.PURCHASE_ORDER]: 'purchase-orders',
};

@Auth()
@Controller('storage/uploads')
export class StorageController {
  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @InjectRepository(Style) private readonly styleRepo: Repository<Style>,
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
  ) {}

  @Post('presign')
  @UseGuards(PurchaseOrderUploadWriteAccessGuard)
  async presignUpload(@Body() dto: PresignUploadDto) {
    assertAllowedFile(dto.fileName, dto.mimeType, dto.sizeBytes);
    await this.assertEntityExists(dto.entityType, dto.entityId);

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
  @UseGuards(PurchaseOrderDownloadAccessGuard)
  async getViewUrl(
    @Query('objectKey') objectKey: string,
    @Query('download') download?: string,
    @Query('fileName') fileName?: string,
  ) {
    if (!objectKey) {
      throw new BadRequestException('objectKey không được để trống');
    }
    await this.assertObjectKeyScope(objectKey);

    const url = await this.storage.getPresignedGetUrl(
      objectKey,
      PRESIGN_GET_EXPIRY_SECONDS,
      download === 'true'
        ? (fileName ?? objectKey.split('/').pop())
        : undefined,
    );

    return { url, expiresIn: PRESIGN_GET_EXPIRY_SECONDS };
  }

  // No FE caller anywhere in the app hits this today — the old DELETE
  // route accepted any objectKey with nothing but @Auth(), letting any
  // logged-in user permanently delete any object in the whole bucket.
  // Removed rather than scoped: deletion for a real resource (a style
  // document, a sample-round image, a PO document) belongs on that
  // resource's own endpoint, which already validates ownership before
  // calling storage.deleteObject().

  private async assertEntityExists(
    entityType: StorageEntityType,
    entityId: string,
  ): Promise<void> {
    if (entityType === StorageEntityType.STYLE) {
      const exists = await this.styleRepo.exist({ where: { id: entityId } });
      if (!exists) {
        throw new NotFoundException(
          `Không tìm thấy mẫu Fit với ID: ${entityId}`,
        );
      }
      return;
    }
    const exists = await this.poRepo.exist({ where: { id: entityId } });
    if (!exists) {
      throw new NotFoundException(
        `Không tìm thấy đơn hàng với ID: ${entityId}`,
      );
    }
  }

  // view-url used to accept any objectKey with no ownership check at all —
  // any logged-in user could read a presigned URL for any object in the
  // whole bucket. Scope it to the same styles/<id>/... or
  // purchase-orders/<id>/... prefix this controller itself issues at
  // presign, and require that entity to still exist.
  private async assertObjectKeyScope(objectKey: string): Promise<void> {
    const styleMatch = objectKey.match(/^styles\/([^/]+)\//);
    if (styleMatch) {
      await this.assertEntityExists(StorageEntityType.STYLE, styleMatch[1]);
      return;
    }

    const poMatch = objectKey.match(/^purchase-orders\/([^/]+)\//);
    if (poMatch) {
      await this.assertEntityExists(
        StorageEntityType.PURCHASE_ORDER,
        poMatch[1],
      );
      return;
    }

    throw new ForbiddenException('objectKey không hợp lệ');
  }
}
