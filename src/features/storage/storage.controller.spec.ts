import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { STORAGE_SERVICE, StorageService } from './storage.interface';
import { PresignUploadDto, StorageEntityType } from './dto/presign-upload.dto';
import { DocumentPurpose } from '../../common/enums/database.enums';

describe('StorageController', () => {
  let controller: StorageController;
  let storage: jest.Mocked<StorageService>;

  beforeEach(async () => {
    storage = {
      getPresignedPutUrl: jest.fn().mockResolvedValue('https://s3.example/put'),
      getPresignedGetUrl: jest.fn().mockResolvedValue('https://s3.example/get'),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      headObject: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [{ provide: STORAGE_SERVICE, useValue: storage }],
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

    it('rejects an oversized file before calling the storage service', async () => {
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
      expect(storage.getPresignedPutUrl).not.toHaveBeenCalled();
    });
  });

  describe('getViewUrl', () => {
    it('requests an inline URL by default', async () => {
      await controller.getViewUrl('styles/x/documents/tech_pack/f.pdf');

      expect(storage.getPresignedGetUrl).toHaveBeenCalledWith(
        'styles/x/documents/tech_pack/f.pdf',
        3600,
        undefined,
      );
    });

    it('requests an attachment URL when download=true', async () => {
      await controller.getViewUrl(
        'styles/x/documents/tech_pack/f.pdf',
        'true',
        'ten-goc.pdf',
      );

      expect(storage.getPresignedGetUrl).toHaveBeenCalledWith(
        'styles/x/documents/tech_pack/f.pdf',
        3600,
        'ten-goc.pdf',
      );
    });

    it('throws when objectKey is missing', async () => {
      await expect(controller.getViewUrl('')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deleteObject', () => {
    it('delegates to the storage service', async () => {
      await controller.deleteObject('styles/x/documents/tech_pack/f.pdf');

      expect(storage.deleteObject).toHaveBeenCalledWith(
        'styles/x/documents/tech_pack/f.pdf',
      );
    });

    it('throws when objectKey is missing', async () => {
      await expect(controller.deleteObject('')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
