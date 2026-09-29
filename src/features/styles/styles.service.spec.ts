import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StylesService } from './styles.service';
import { Style } from './entities/Style.entity';
import { StyleDocument } from './entities/StyleDocument.entity';
import { DraftBomFamilie } from '../draft-boms/entities/DraftBomFamilie.entity';
import { StyleStatus } from '../../common/enums/database.enums';
import { STORAGE_SERVICE } from '../storage/storage.interface';

describe('StylesService', () => {
  let service: StylesService;
  let repositoryMock: any;
  let draftBomFamilyRepositoryMock: any;
  let styleDocumentRepositoryMock: any;
  let dataSourceMock: any;
  let managerMock: any;
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

    draftBomFamilyRepositoryMock = {
      exists: jest.fn().mockResolvedValue(false),
    };

    styleDocumentRepositoryMock = {
      find: jest.fn().mockResolvedValue([]),
    };

    managerMock = {
      remove: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
    };

    dataSourceMock = {
      transaction: jest
        .fn()
        .mockImplementation(async (cb: any) => cb(managerMock)),
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
          provide: getRepositoryToken(DraftBomFamilie),
          useValue: draftBomFamilyRepositoryMock,
        },
        {
          provide: getRepositoryToken(StyleDocument),
          useValue: styleDocumentRepositoryMock,
        },
        {
          provide: STORAGE_SERVICE,
          useValue: storageMock,
        },
        {
          provide: DataSource,
          useValue: dataSourceMock,
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

  describe('remove', () => {
    it('deletes the style when there is no draft BOM and no FK violation', async () => {
      repositoryMock.findOne.mockResolvedValue({ ...mockStyle });

      await service.remove(STYLE_ID);

      expect(draftBomFamilyRepositoryMock.exists).toHaveBeenCalledWith({
        where: { styleId: STYLE_ID },
      });
      expect(managerMock.remove).toHaveBeenCalledWith(
        Style,
        expect.objectContaining({ id: STYLE_ID }),
      );
    });

    it('throws ConflictException when the style has an unpromoted draft BOM', async () => {
      repositoryMock.findOne.mockResolvedValue({ ...mockStyle });
      draftBomFamilyRepositoryMock.exists.mockResolvedValue(true);

      await expect(service.remove(STYLE_ID)).rejects.toThrow(ConflictException);
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException on a foreign-key violation (promoted BOM etc.)', async () => {
      repositoryMock.findOne.mockResolvedValue({ ...mockStyle });
      managerMock.remove.mockRejectedValue({ code: '23503' });

      await expect(service.remove(STYLE_ID)).rejects.toThrow(ConflictException);
    });

    it('does nothing further when the style has no linked documents', async () => {
      repositoryMock.findOne.mockResolvedValue({ ...mockStyle });
      styleDocumentRepositoryMock.find.mockResolvedValue([]);

      await service.remove(STYLE_ID);

      expect(managerMock.query).not.toHaveBeenCalled();
      expect(storageMock.deleteObject).not.toHaveBeenCalled();
    });

    it('hard-deletes a document/version and its S3 object once fully orphaned', async () => {
      repositoryMock.findOne.mockResolvedValue({ ...mockStyle });
      styleDocumentRepositoryMock.find.mockResolvedValue([
        { styleId: STYLE_ID, documentId: 'doc-1' },
      ]);
      managerMock.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT document_id FROM style_documents')) {
          return Promise.resolve([]); // no other reference anywhere
        }
        if (sql.includes('SELECT id, document_id, storage_key')) {
          return Promise.resolve([
            {
              id: 'ver-1',
              document_id: 'doc-1',
              storage_key: 'styles/x/documents/fit_attachment/a.pdf',
            },
          ]);
        }
        if (
          sql.includes(
            'SELECT document_version_id FROM product_color_card_versions',
          )
        ) {
          return Promise.resolve([]); // version not referenced elsewhere either
        }
        return Promise.resolve([]);
      });

      await service.remove(STYLE_ID);

      expect(managerMock.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM document_versions'),
        [['doc-1']],
      );
      expect(managerMock.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM documents'),
        [['doc-1']],
      );
      expect(storageMock.deleteObject).toHaveBeenCalledWith(
        'styles/x/documents/fit_attachment/a.pdf',
      );
    });

    it('does not delete a document still referenced by another style/PO/folder', async () => {
      repositoryMock.findOne.mockResolvedValue({ ...mockStyle });
      styleDocumentRepositoryMock.find.mockResolvedValue([
        { styleId: STYLE_ID, documentId: 'doc-shared' },
      ]);
      managerMock.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT document_id FROM style_documents')) {
          return Promise.resolve([{ document_id: 'doc-shared' }]); // still linked elsewhere
        }
        return Promise.resolve([]);
      });

      await service.remove(STYLE_ID);

      expect(managerMock.query).not.toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM documents'),
        expect.anything(),
      );
      expect(storageMock.deleteObject).not.toHaveBeenCalled();
    });

    it('does not delete a document whose version is still referenced (e.g. a sample image)', async () => {
      repositoryMock.findOne.mockResolvedValue({ ...mockStyle });
      styleDocumentRepositoryMock.find.mockResolvedValue([
        { styleId: STYLE_ID, documentId: 'doc-2' },
      ]);
      managerMock.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT document_id FROM style_documents')) {
          return Promise.resolve([]);
        }
        if (sql.includes('SELECT id, document_id, storage_key')) {
          return Promise.resolve([
            {
              id: 'ver-2',
              document_id: 'doc-2',
              storage_key: 'styles/x/documents/fit_attachment/b.pdf',
            },
          ]);
        }
        if (
          sql.includes(
            'SELECT document_version_id FROM product_color_card_versions',
          )
        ) {
          return Promise.resolve([{ document_version_id: 'ver-2' }]); // still referenced
        }
        return Promise.resolve([]);
      });

      await service.remove(STYLE_ID);

      expect(managerMock.query).not.toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM documents'),
        expect.anything(),
      );
      expect(storageMock.deleteObject).not.toHaveBeenCalled();
    });
  });
});
