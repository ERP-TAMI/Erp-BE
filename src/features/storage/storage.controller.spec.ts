import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StorageController } from './storage.controller';
import { STORAGE_SERVICE, StorageService } from './storage.interface';
import { PresignUploadDto, StorageEntityType } from './dto/presign-upload.dto';
import { DocumentPurpose } from '../../common/enums/database.enums';
import { Style } from '../styles/entities/Style.entity';
import { PurchaseOrder } from '../purchase-orders/entities/PurchaseOrder.entity';

describe('StorageController', () => {
  let controller: StorageController;
  let storage: jest.Mocked<StorageService>;
  let styleRepo: { exist: jest.Mock };
  let poRepo: { exist: jest.Mock };

  beforeEach(async () => {
    storage = {
      getPresignedPutUrl: jest.fn().mockResolvedValue('https://s3.example/put'),
      getPresignedGetUrl: jest.fn().mockResolvedValue('https://s3.example/get'),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      copyObject: jest.fn().mockResolvedValue(undefined),
      headObject: jest.fn(),
      getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('')),
      getObjectHead: jest.fn().mockResolvedValue(Buffer.from('')),
      isTrustedObjectHost: jest.fn().mockReturnValue(true),
    };
    styleRepo = { exist: jest.fn().mockResolvedValue(true) };
    poRepo = { exist: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [
        { provide: STORAGE_SERVICE, useValue: storage },
        { provide: getRepositoryToken(Style), useValue: styleRepo },
        { provide: getRepositoryToken(PurchaseOrder), useValue: poRepo },
      ],
    }).compile();

    controller = module.get<StorageController>(StorageController);
  });

  describe('presignUpload', () => {
    it('builds an objectKey scoped by entity/purpose and returns the presigned URL', async () => {
      const dto: PresignUploadDto = {
        entityType: StorageEntityType.STYLE,
        entityId: '8f3a1c2e-4b6a-4e1a-9c2d-1a2b3c4d5e6f',
        purpose: DocumentPurpose.SAMPLE_IMAGE,
        fileName: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 2048,
      };

      const result = await controller.presignUpload(dto);

      expect(styleRepo.exist).toHaveBeenCalledWith({
        where: { id: dto.entityId },
      });
      expect(storage.getPresignedPutUrl).toHaveBeenCalledTimes(1);
      const [objectKey, contentType] = storage.getPresignedPutUrl.mock.calls[0];
      expect(objectKey).toMatch(
        /^styles\/8f3a1c2e-4b6a-4e1a-9c2d-1a2b3c4d5e6f\/documents\/sample_image\/[0-9a-f-]+\.png$/,
      );
      expect(contentType).toBe('image/png');
      expect(result).toMatchObject({
        objectKey,
        uploadUrl: 'https://s3.example/put',
      });
    });

    it('rejects an oversized file before checking the entity or calling the storage service', async () => {
      const dto: PresignUploadDto = {
        entityType: StorageEntityType.PURCHASE_ORDER,
        entityId: '9b2d4f10-0000-4e1a-9c2d-1a2b3c4d5e6f',
        purpose: DocumentPurpose.PO_ORIGINAL,
        fileName: 'huge.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 21 * 1024 * 1024,
      };

      await expect(controller.presignUpload(dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(poRepo.exist).not.toHaveBeenCalled();
      expect(storage.getPresignedPutUrl).not.toHaveBeenCalled();
    });

    it('rejects when the target entity does not exist', async () => {
      styleRepo.exist.mockResolvedValue(false);
      const dto: PresignUploadDto = {
        entityType: StorageEntityType.STYLE,
        entityId: '00000000-0000-4000-8000-000000000000',
        purpose: DocumentPurpose.SAMPLE_IMAGE,
        fileName: 'photo.png',
        mimeType: 'image/png',
        sizeBytes: 2048,
      };

      await expect(controller.presignUpload(dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(storage.getPresignedPutUrl).not.toHaveBeenCalled();
    });
  });

  describe('getViewUrl', () => {
    it('requests an inline URL by default', async () => {
      await controller.getViewUrl('styles/x/documents/tech_pack/f.pdf');

      expect(styleRepo.exist).toHaveBeenCalledWith({ where: { id: 'x' } });
      expect(storage.getPresignedGetUrl).toHaveBeenCalledWith(
        'styles/x/documents/tech_pack/f.pdf',
        3600,
        undefined,
      );
    });

    it('requests an attachment URL when download=true', async () => {
      await controller.getViewUrl(
        'purchase-orders/y/documents/tech_pack/f.pdf',
        'true',
        'ten-goc.pdf',
      );

      expect(poRepo.exist).toHaveBeenCalledWith({ where: { id: 'y' } });
      expect(storage.getPresignedGetUrl).toHaveBeenCalledWith(
        'purchase-orders/y/documents/tech_pack/f.pdf',
        3600,
        'ten-goc.pdf',
      );
    });

    it('throws when objectKey is missing', async () => {
      await expect(controller.getViewUrl('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an objectKey outside the styles/purchase-orders scope', async () => {
      await expect(
        controller.getViewUrl('some-other-bucket-prefix/secret.txt'),
      ).rejects.toThrow(ForbiddenException);
      expect(storage.getPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('rejects when the referenced entity no longer exists', async () => {
      styleRepo.exist.mockResolvedValue(false);

      await expect(
        controller.getViewUrl('styles/deleted-style/documents/tech_pack/f.pdf'),
      ).rejects.toThrow(NotFoundException);
      expect(storage.getPresignedGetUrl).not.toHaveBeenCalled();
    });
  });
});
