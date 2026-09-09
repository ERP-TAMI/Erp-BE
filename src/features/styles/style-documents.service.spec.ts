import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StyleDocumentsService } from './style-documents.service';
import { Style } from './entities/Style.entity';
import { StyleDocument } from './entities/StyleDocument.entity';
import { Document } from '../documents/entities/Document.entity';
import { DocumentVersion } from '../documents/entities/DocumentVersion.entity';
import { DocumentPurpose } from '../../common/enums/database.enums';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';

function buildQueryBuilderMock(result: unknown) {
  const qb: Record<string, jest.Mock> = {
    innerJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    select: jest.fn(),
    addSelect: jest.fn(),
    orderBy: jest.fn(),
    getRawOne: jest.fn().mockResolvedValue(result),
    getRawMany: jest.fn().mockResolvedValue(result),
  };
  Object.keys(qb).forEach((key) => {
    if (key !== 'getRawOne' && key !== 'getRawMany') {
      qb[key].mockReturnValue(qb);
    }
  });
  return qb;
}

describe('StyleDocumentsService', () => {
  let service: StyleDocumentsService;
  let styleRepoMock: { exist: jest.Mock };
  let styleDocRepoMock: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let storageMock: jest.Mocked<StorageService>;
  let docRepoMock: { create: jest.Mock; save: jest.Mock };
  let versionRepoMock: { create: jest.Mock; save: jest.Mock };
  let styleDocTxRepoMock: { create: jest.Mock; save: jest.Mock };

  const STYLE_ID = '8f3a1c2e-4b6a-4e1a-9c2d-1a2b3c4d5e6f';

  beforeEach(async () => {
    styleRepoMock = { exist: jest.fn().mockResolvedValue(true) };
    styleDocRepoMock = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };

    docRepoMock = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => ({ id: 'doc-1', ...v })),
    };
    versionRepoMock = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => ({ id: 'version-1', ...v })),
    };
    styleDocTxRepoMock = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockResolvedValue(undefined),
    };

    storageMock = {
      getPresignedPutUrl: jest.fn().mockResolvedValue('https://s3.example/put'),
      getPresignedGetUrl: jest.fn().mockResolvedValue('https://s3.example/get'),
      deleteObject: jest.fn(),
      headObject: jest.fn().mockResolvedValue({ exists: true }),
    };

    const dataSourceMock = {
      transaction: jest.fn().mockImplementation((cb: any) => {
        const manager = {
          getRepository: (entity: any) => {
            if (entity === Document) return docRepoMock;
            if (entity === DocumentVersion) return versionRepoMock;
            if (entity === StyleDocument) return styleDocTxRepoMock;
            throw new Error(`No mock repository for entity ${entity?.name}`);
          },
        };
        return cb(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StyleDocumentsService,
        { provide: getRepositoryToken(Style), useValue: styleRepoMock },
        {
          provide: getRepositoryToken(StyleDocument),
          useValue: styleDocRepoMock,
        },
        { provide: STORAGE_SERVICE, useValue: storageMock },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get<StyleDocumentsService>(StyleDocumentsService);
  });

  describe('presign', () => {
    it('builds an objectKey scoped to the style and fit_attachment purpose', async () => {
      const result = await service.presign(STYLE_ID, {
        fileName: 'tech-pack.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      });

      expect(result.objectKey).toMatch(
        new RegExp(`^styles/${STYLE_ID}/documents/fit_attachment/[0-9a-f-]+\\.pdf$`),
      );
      expect(storageMock.getPresignedPutUrl).toHaveBeenCalledWith(
        result.objectKey,
        'application/pdf',
        300,
      );
    });

    it('throws NotFoundException when the style does not exist', async () => {
      styleRepoMock.exist.mockResolvedValue(false);

      await expect(
        service.presign(STYLE_ID, {
          fileName: 'tech-pack.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 2048,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(storageMock.getPresignedPutUrl).not.toHaveBeenCalled();
    });

    it('rejects a disallowed file type before calling storage', async () => {
      await expect(
        service.presign(STYLE_ID, {
          fileName: 'virus.exe',
          mimeType: 'application/octet-stream',
          sizeBytes: 2048,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(storageMock.getPresignedPutUrl).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('creates document, version and the style link inside one transaction', async () => {
      const result = await service.confirm(STYLE_ID, 'user-1', {
        objectKey: `styles/${STYLE_ID}/documents/fit_attachment/x.pdf`,
        fileName: 'tech-pack.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      });

      expect(storageMock.headObject).toHaveBeenCalledWith(
        `styles/${STYLE_ID}/documents/fit_attachment/x.pdf`,
      );
      expect(docRepoMock.save).toHaveBeenCalledTimes(2);
      expect(styleDocTxRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          styleId: STYLE_ID,
          purpose: DocumentPurpose.FIT_ATTACHMENT,
        }),
      );
      expect(result).toMatchObject({
        fileName: 'tech-pack.pdf',
        mimeType: 'application/pdf',
        byteSize: 2048,
        purpose: DocumentPurpose.FIT_ATTACHMENT,
      });
    });

    it('rejects when the object was not actually uploaded to S3', async () => {
      storageMock.headObject.mockResolvedValue({ exists: false });

      await expect(
        service.confirm(STYLE_ID, 'user-1', {
          objectKey: `styles/${STYLE_ID}/documents/fit_attachment/x.pdf`,
          fileName: 'tech-pack.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 2048,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(docRepoMock.save).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns one JOIN result mapped to the list item shape', async () => {
      const qb = buildQueryBuilderMock([
        {
          documentId: 'doc-1',
          fileName: 'tech-pack.pdf',
          mimeType: 'application/pdf',
          byteSize: '2048',
          uploadedAt: new Date('2026-01-01'),
          purpose: DocumentPurpose.FIT_ATTACHMENT,
        },
      ]);
      styleDocRepoMock.createQueryBuilder.mockReturnValue(qb);

      const result = await service.list(STYLE_ID);

      expect(styleDocRepoMock.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(result).toEqual([
        {
          documentId: 'doc-1',
          fileName: 'tech-pack.pdf',
          mimeType: 'application/pdf',
          byteSize: 2048,
          uploadedAt: new Date('2026-01-01'),
          purpose: DocumentPurpose.FIT_ATTACHMENT,
        },
      ]);
    });
  });

  describe('getViewUrl', () => {
    it('requests an inline url using the storage key of the linked document', async () => {
      const qb = buildQueryBuilderMock({
        storageKey: `styles/${STYLE_ID}/documents/fit_attachment/x.pdf`,
        fileName: 'tech-pack.pdf',
      });
      styleDocRepoMock.createQueryBuilder.mockReturnValue(qb);

      await service.getViewUrl(STYLE_ID, 'doc-1', false);

      expect(storageMock.getPresignedGetUrl).toHaveBeenCalledWith(
        `styles/${STYLE_ID}/documents/fit_attachment/x.pdf`,
        3600,
        undefined,
      );
    });

    it('throws NotFoundException when the document is not linked to this style', async () => {
      const qb = buildQueryBuilderMock(undefined);
      styleDocRepoMock.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.getViewUrl(STYLE_ID, 'unknown-doc', false),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('removes only the link row, never the document itself', async () => {
      styleDocRepoMock.findOne.mockResolvedValue({
        styleId: STYLE_ID,
        documentId: 'doc-1',
      });

      await service.remove(STYLE_ID, 'doc-1');

      expect(styleDocRepoMock.remove).toHaveBeenCalledWith({
        styleId: STYLE_ID,
        documentId: 'doc-1',
      });
    });

    it('throws NotFoundException when there is no such link', async () => {
      styleDocRepoMock.findOne.mockResolvedValue(null);

      await expect(service.remove(STYLE_ID, 'doc-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(styleDocRepoMock.remove).not.toHaveBeenCalled();
    });
  });
});
