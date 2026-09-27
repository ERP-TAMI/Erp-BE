import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { StylesService } from './styles.service';
import { Style } from './entities/Style.entity';
import { StyleStatus } from '../../common/enums/database.enums';
import { STORAGE_SERVICE } from '../storage/storage.interface';

describe('StylesService', () => {
  let service: StylesService;
  let repositoryMock: any;
  let storageMock: any;
  const STYLE_ID = '123e4567-e89b-12d3-a456-426614174000';

  const mockStyle: Partial<Style> = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    styleCode: 'FIT-2026-001',
    styleName: 'Áo Polo Nam',
    description: 'Mẫu Polo Nam 2026',
    category: 'Áo Polo',
    status: StyleStatus.DRAFT,
    rowVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    repositoryMock = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation(async (style) => ({
        id: '123e4567-e89b-12d3-a456-426614174000',
        ...style,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findOne: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockStyle], 1]),
      }),
    };

    storageMock = {
      getPresignedPutUrl: jest.fn(),
      getPresignedGetUrl: jest.fn().mockResolvedValue('https://s3.example/get'),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      headObject: jest
        .fn()
        .mockResolvedValue({ exists: true, sizeBytes: 1024 }),
      getObjectBuffer: jest.fn(),
      isTrustedObjectHost: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StylesService,
        {
          provide: getRepositoryToken(Style),
          useValue: repositoryMock,
        },
        {
          provide: STORAGE_SERVICE,
          useValue: storageMock,
        },
      ],
    }).compile();

    service = module.get<StylesService>(StylesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new style successfully', async () => {
      repositoryMock.findOne.mockResolvedValue(null);

      const result = await service.create({
        styleCode: 'FIT-2026-001',
        styleName: 'Áo Polo Nam',
        category: 'Áo Polo',
      });

      expect(result.styleCode).toBe('FIT-2026-001');
      expect(result.status).toBe(StyleStatus.DRAFT);
      expect(repositoryMock.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if styleCode already exists', async () => {
      repositoryMock.findOne.mockResolvedValue(mockStyle);

      await expect(
        service.create({
          styleCode: 'FIT-2026-001',
          styleName: 'Áo Polo Nam',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if styleCode is empty', async () => {
      await expect(
        service.create({
          styleCode: '   ',
          styleName: 'Áo Polo Nam',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if styleName is empty', async () => {
      await expect(
        service.create({
          styleCode: 'FIT-2026-001',
          styleName: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should ignore a client-supplied baseImageKey at creation (no id yet to scope it to)', async () => {
      repositoryMock.findOne.mockResolvedValue(null);

      const result = await service.create({
        styleCode: 'FIT-2026-001',
        styleName: 'Áo Polo Nam',
        baseImageKey: 'purchase-orders/some-other-po/documents/x/f.png',
      } as any);

      expect(result.baseImageKey).toBeNull();
      expect(storageMock.headObject).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated result', async () => {
      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return a style if found', async () => {
      repositoryMock.findOne.mockResolvedValue(mockStyle);

      const result = await service.findOne(
        '123e4567-e89b-12d3-a456-426614174000',
      );

      expect(result).toEqual(mockStyle);
    });

    it('should throw NotFoundException if not found', async () => {
      repositoryMock.findOne.mockResolvedValue(null);

      await expect(
        service.findOne('123e4567-e89b-12d3-a456-426614174000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update style fields and status', async () => {
      repositoryMock.findOne.mockResolvedValue({ ...mockStyle });

      const updated = await service.update(
        '123e4567-e89b-12d3-a456-426614174000',
        {
          styleName: 'Áo Polo Nam Mới',
          status: StyleStatus.ACTIVE,
        },
      );

      expect(updated.styleName).toBe('Áo Polo Nam Mới');
      expect(updated.status).toBe(StyleStatus.ACTIVE);
    });

    it('should throw BadRequestException if updating styleName to whitespace', async () => {
      repositoryMock.findOne.mockResolvedValue({ ...mockStyle });

      await expect(
        service.update('123e4567-e89b-12d3-a456-426614174000', {
          styleName: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    describe('baseImageKey', () => {
      it('accepts a key scoped to this style and resolved from an existing object', async () => {
        repositoryMock.findOne.mockResolvedValue({ ...mockStyle });
        const objectKey = `styles/${STYLE_ID}/documents/sample_image/abc.png`;

        const updated = await service.update(STYLE_ID, {
          baseImageKey: objectKey,
        } as any);

        expect(storageMock.headObject).toHaveBeenCalledWith(objectKey);
        expect(updated.baseImageKey).toBe(objectKey);
        expect(repositoryMock.save).toHaveBeenCalled();
      });

      it('clears the image without touching storage when set to null', async () => {
        repositoryMock.findOne.mockResolvedValue({
          ...mockStyle,
          baseImageKey: `styles/${STYLE_ID}/documents/sample_image/old.png`,
        });

        const updated = await service.update(STYLE_ID, {
          baseImageKey: null,
        } as any);

        expect(updated.baseImageKey).toBeNull();
        expect(storageMock.headObject).not.toHaveBeenCalled();
      });

      it('rejects an objectKey belonging to another resource (cross-resource hijack)', async () => {
        repositoryMock.findOne.mockResolvedValue({ ...mockStyle });

        await expect(
          service.update(STYLE_ID, {
            baseImageKey: 'purchase-orders/other-po-id/documents/x/f.png',
          } as any),
        ).rejects.toThrow(BadRequestException);
        expect(repositoryMock.save).not.toHaveBeenCalled();
      });

      it('rejects an objectKey scoped to a different style id', async () => {
        repositoryMock.findOne.mockResolvedValue({ ...mockStyle });

        await expect(
          service.update(STYLE_ID, {
            baseImageKey: 'styles/some-other-style-id/documents/x/f.png',
          } as any),
        ).rejects.toThrow(BadRequestException);
        expect(repositoryMock.save).not.toHaveBeenCalled();
      });

      it('rejects when the object was never actually uploaded', async () => {
        repositoryMock.findOne.mockResolvedValue({ ...mockStyle });
        storageMock.headObject.mockResolvedValueOnce({ exists: false });

        await expect(
          service.update(STYLE_ID, {
            baseImageKey: `styles/${STYLE_ID}/documents/sample_image/abc.png`,
          } as any),
        ).rejects.toThrow(BadRequestException);
        expect(repositoryMock.save).not.toHaveBeenCalled();
      });

      it('rejects and deletes an oversized object', async () => {
        repositoryMock.findOne.mockResolvedValue({ ...mockStyle });
        const objectKey = `styles/${STYLE_ID}/documents/sample_image/huge.png`;
        storageMock.headObject.mockResolvedValueOnce({
          exists: true,
          sizeBytes: 21 * 1024 * 1024,
        });

        await expect(
          service.update(STYLE_ID, { baseImageKey: objectKey } as any),
        ).rejects.toThrow(BadRequestException);
        expect(storageMock.deleteObject).toHaveBeenCalledWith(objectKey);
        expect(repositoryMock.save).not.toHaveBeenCalled();
      });
    });
  });
});
