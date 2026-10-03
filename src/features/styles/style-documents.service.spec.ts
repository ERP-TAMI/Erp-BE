import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StyleDocumentsService } from './style-documents.service';
import { Style } from './entities/Style.entity';
import { StyleDocument } from './entities/StyleDocument.entity';
import { Document } from '../documents/entities/Document.entity';
import { DocumentVersion } from '../documents/entities/DocumentVersion.entity';
import {
  DocumentPurpose,
  UploadStatus,
} from '../../common/enums/database.enums';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { AuditService } from '../audit/audit.service';

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
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let storageMock: jest.Mocked<StorageService>;
  let docRepoMock: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let versionRepoMock: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let styleDocTxRepoMock: {
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let auditServiceMock: { recordEntityChange: jest.Mock };

  const STYLE_ID = '8f3a1c2e-4b6a-4e1a-9c2d-1a2b3c4d5e6f';

  beforeEach(async () => {
    styleRepoMock = { exist: jest.fn().mockResolvedValue(true) };
    styleDocRepoMock = {
      createQueryBuilder: jest.fn().mockReturnValue(buildQueryBuilderMock([])),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      remove: jest.fn(),
    };

    docRepoMock = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => ({ id: 'doc-1', ...v })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'doc-1', title: 'tech-pack.pdf' }),
    };
    versionRepoMock = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => ({ id: 'version-1', ...v })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    styleDocTxRepoMock = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ raw: [] }),
      }),
    };
    auditServiceMock = {
      recordEntityChange: jest.fn().mockResolvedValue(undefined),
    };

    storageMock = {
      getPresignedPutUrl: jest.fn().mockResolvedValue('https://s3.example/put'),
      getPresignedGetUrl: jest.fn().mockResolvedValue('https://s3.example/get'),
      deleteObject: jest.fn(),
      copyObject: jest.fn(),
      headObject: jest.fn().mockResolvedValue({ exists: true }),
      getObjectHead: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.5')),
      getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('')),
      isTrustedObjectHost: jest.fn().mockReturnValue(true),
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
        { provide: getRepositoryToken(Document), useValue: docRepoMock },
        {
          provide: getRepositoryToken(DocumentVersion),
          useValue: versionRepoMock,
        },
        { provide: STORAGE_SERVICE, useValue: storageMock },
        { provide: DataSource, useValue: dataSourceMock },
        { provide: AuditService, useValue: auditServiceMock },
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
        new RegExp(
          `^styles/${STYLE_ID}/documents/fit_attachment/[0-9a-f-]+\\.pdf$`,
        ),
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
      storageMock.headObject.mockResolvedValue({
        exists: true,
        sizeBytes: 1536,
      });
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
        byteSize: 1536,
        purpose: DocumentPurpose.FIT_ATTACHMENT,
      });
      expect(versionRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ byteSize: 1536 }),
      );
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

    it('rejects and deletes the object when the real uploaded size exceeds the limit', async () => {
      storageMock.headObject.mockResolvedValue({
        exists: true,
        sizeBytes: 21 * 1024 * 1024,
      });
      const objectKey = `styles/${STYLE_ID}/documents/fit_attachment/huge.pdf`;

      await expect(
        service.confirm(STYLE_ID, 'user-1', {
          objectKey,
          fileName: 'huge.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 2048, // client under-reported this at presign time
        }),
      ).rejects.toThrow(BadRequestException);
      expect(storageMock.deleteObject).toHaveBeenCalledWith(objectKey);
      expect(docRepoMock.save).not.toHaveBeenCalled();
    });

    it('rejects when the uploaded content does not match its declared extension (magic-byte check)', async () => {
      storageMock.getObjectHead.mockResolvedValueOnce(
        Buffer.from('<html><script>alert(1)</script></html>'),
      );

      await expect(
        service.confirm(STYLE_ID, 'user-1', {
          objectKey: `styles/${STYLE_ID}/documents/fit_attachment/fake.pdf`,
          fileName: 'fake.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 40,
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
          documentVersionId: 'version-1',
          versionNo: '2',
          currentVersionId: 'version-2',
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
          documentVersionId: 'version-1',
          versionNo: 2,
          isCurrentVersion: false,
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

      expect(styleDocTxRepoMock.remove).toHaveBeenCalledWith({
        styleId: STYLE_ID,
        documentId: 'doc-1',
      });
    });

    it('throws NotFoundException when there is no such link', async () => {
      styleDocRepoMock.findOne.mockResolvedValue(null);

      await expect(service.remove(STYLE_ID, 'doc-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(styleDocTxRepoMock.remove).not.toHaveBeenCalled();
    });
  });

  describe('assignFromLibrary', () => {
    it('promotes an existing non-fit link instead of silently ignoring the assignment', async () => {
      const document = {
        id: 'doc-1',
        title: 'spec.pdf',
        currentVersionId: 'version-2',
        archivedAt: null,
      };
      const existingLink = {
        styleId: STYLE_ID,
        documentId: 'doc-1',
        documentVersionId: 'version-1',
        purpose: DocumentPurpose.OTHER,
        linkedBy: 'old-user',
        linkedAt: new Date('2025-01-01T00:00:00.000Z'),
      };
      docRepoMock.find.mockResolvedValue([document]);
      versionRepoMock.find.mockResolvedValue([
        {
          id: 'version-2',
          documentId: 'doc-1',
          versionNo: 2,
          status: UploadStatus.READY,
        },
      ]);
      styleDocRepoMock.find.mockResolvedValue([existingLink]);

      await service.assignFromLibrary(STYLE_ID, ['doc-1'], {
        id: 'rd-user',
        roleCode: 'RD',
      });

      expect(styleDocTxRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          styleId: STYLE_ID,
          documentId: 'doc-1',
          documentVersionId: 'version-2',
          purpose: DocumentPurpose.FIT_ATTACHMENT,
          linkedBy: 'rd-user',
        }),
      );
      expect(auditServiceMock.recordEntityChange).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          aggregateId: 'doc-1',
          parentId: STYLE_ID,
          eventType: 'updated',
        }),
      );
    });
  });
});
