import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StyleProductionDocsService } from './style-production-docs.service';
import { ProductionDocument } from './entities/ProductionDocument.entity';
import { ProductionDocumentSection } from './entities/ProductionDocumentSection.entity';
import { ProductionDocumentSizeRow } from './entities/ProductionDocumentSizeRow.entity';
import { Style } from '../styles/entities/Style.entity';
import { StyleDocument } from '../styles/entities/StyleDocument.entity';
import { Document } from '../documents/entities/Document.entity';
import { Bom } from '../boms/entities/Bom.entity';
import { BomLine } from '../boms/entities/BomLine.entity';
import { ProductionDocStatus } from '../../common/enums/database.enums';
import { STORAGE_SERVICE } from '../storage/storage.interface';
import { AuditService } from '../audit/audit.service';

describe('StyleProductionDocsService', () => {
  let service: StyleProductionDocsService;

  let prodDocRepoMock: any;
  let sectionRepoMock: any;
  let sizeRowRepoMock: any;
  let styleRepoMock: any;
  let styleDocRepoMock: any;
  let docRepoMock: any;
  let bomRepoMock: any;
  let bomLineRepoMock: any;
  let storageMock: any;

  const mockStyle = {
    id: 'style-uuid-1',
    styleCode: 'FIT-2026-001',
    styleName: 'Áo Polo Nam',
    description: 'Áo Polo Nam mô tả',
    status: 'draft',
  };

  const mockDoc = {
    id: 'doc-uuid-1',
    styleId: 'style-uuid-1',
    name: 'Tài liệu sản xuất tiếng Việt',
    description: null,
    status: ProductionDocStatus.DRAFT,
    rowVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prodDocRepoMock = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest
        .fn()
        .mockImplementation((doc) =>
          Promise.resolve({ id: 'doc-uuid-1', ...doc }),
        ),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    sectionRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((secs) => Promise.resolve(secs)),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    sizeRowRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((rows) => Promise.resolve(rows)),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    styleRepoMock = {
      findOne: jest.fn().mockResolvedValue(mockStyle),
    };

    styleDocRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    docRepoMock = {
      findOne: jest.fn(),
    };

    bomRepoMock = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    bomLineRepoMock = {
      find: jest.fn().mockResolvedValue([]),
    };

    const dataSourceMock = {
      transaction: jest.fn().mockImplementation((cb: any) => {
        const manager = {
          getRepository: (entity: any) => {
            if (entity === ProductionDocument) return prodDocRepoMock;
            if (entity === ProductionDocumentSection) return sectionRepoMock;
            if (entity === ProductionDocumentSizeRow) return sizeRowRepoMock;
            throw new Error(`No mock repository for entity ${entity?.name}`);
          },
        };
        return cb(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StyleProductionDocsService,
        {
          provide: getRepositoryToken(ProductionDocument),
          useValue: prodDocRepoMock,
        },
        {
          provide: getRepositoryToken(ProductionDocumentSection),
          useValue: sectionRepoMock,
        },
        {
          provide: getRepositoryToken(ProductionDocumentSizeRow),
          useValue: sizeRowRepoMock,
        },
        { provide: getRepositoryToken(Style), useValue: styleRepoMock },
        {
          provide: getRepositoryToken(StyleDocument),
          useValue: styleDocRepoMock,
        },
        { provide: getRepositoryToken(Document), useValue: docRepoMock },
        {
          provide: getRepositoryToken(Bom),
          useValue: bomRepoMock,
        },
        {
          provide: getRepositoryToken(BomLine),
          useValue: bomLineRepoMock,
        },
        { provide: DataSource, useValue: dataSourceMock },
        {
          provide: STORAGE_SERVICE,
          useValue: (storageMock = {
            getPresignedPutUrl: jest.fn(),
            getPresignedGetUrl: jest
              .fn()
              .mockResolvedValue('https://s3.example/get'),
            deleteObject: jest.fn(),
            headObject: jest.fn(),
            getObjectBuffer: jest.fn(),
            getObjectHead: jest.fn(),
            isTrustedObjectHost: jest.fn().mockReturnValue(false),
          }),
        },
        {
          provide: AuditService,
          useValue: {
            recordEntityChange: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<StyleProductionDocsService>(
      StyleProductionDocsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createWithAutoFill', () => {
    it('should create production doc and auto-fill 4 fixed default sections', async () => {
      prodDocRepoMock.findOne.mockResolvedValueOnce(null);

      const res = await service.createWithAutoFill('style-uuid-1', {
        name: 'Tài liệu sản xuất mới',
      });

      expect(res.name).toBe('Tài liệu sản xuất mới');
      expect(sectionRepoMock.save).toHaveBeenCalled();
    });

    it('should save sizeData from dto.sizeData, not from dto.sizeRows', async () => {
      prodDocRepoMock.findOne.mockResolvedValueOnce(null);
      const sizeData = [
        {
          imageUrl:
            'styles/style-uuid-1/documents/production_doc_image/img-1.png',
        },
      ];
      const sizeRows = [
        {
          sizeLabel: 'M',
          measurementName: 'Chest',
          imageUrl:
            'styles/style-uuid-1/documents/production_doc_image/img-2.png',
        },
      ];

      await service.createWithAutoFill('style-uuid-1', {
        name: 'Tài liệu có ảnh Section 05',
        sizeData,
        sizeRows,
      } as any);

      expect(prodDocRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ sizeData }),
      );
    });

    it('strips a presigned GET URL for our own bucket back to the bare object key before saving', async () => {
      prodDocRepoMock.findOne.mockResolvedValueOnce(null);
      storageMock.isTrustedObjectHost.mockReturnValue(true);
      const objectKey =
        'styles/style-uuid-1/documents/production_doc_image/sketch.png';
      const presignedUrl = `https://erp-tami-storage-dev.s3.us-east-1.amazonaws.com/${objectKey}?X-Amz-Credential=AKIA_FAKE&X-Amz-Signature=deadbeef`;

      await service.createWithAutoFill('style-uuid-1', {
        name: 'Tài liệu',
        section1ImageUrl: presignedUrl,
        sizeData: [{ imageUrl: presignedUrl }],
      } as any);

      expect(prodDocRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          section1ImageUrl: objectKey,
          sizeData: [{ imageUrl: objectKey }],
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('should update status to completed', async () => {
      prodDocRepoMock.findOne.mockResolvedValueOnce(mockDoc);

      const res = await service.updateStatus(
        'doc-uuid-1',
        ProductionDocStatus.COMPLETED,
      );

      expect(res.status).toBe(ProductionDocStatus.COMPLETED);
      expect(prodDocRepoMock.save).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should not crash when a text field is explicitly set to null', async () => {
      prodDocRepoMock.findOne.mockResolvedValueOnce({ ...mockDoc });

      await expect(
        service.update('doc-uuid-1', { section1Description: null } as any),
      ).resolves.not.toThrow();
    });

    it('should persist sizeData from the input, not derive it from sizeRows', async () => {
      prodDocRepoMock.findOne.mockResolvedValueOnce({ ...mockDoc });
      const sizeData = [
        {
          imageUrl:
            'styles/style-uuid-1/documents/production_doc_image/img-1.png',
        },
      ];

      await service.update('doc-uuid-1', { sizeData } as any);

      expect(prodDocRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ sizeData }),
      );
    });

    it('strips a presigned GET URL back to the bare object key instead of persisting the live signature', async () => {
      prodDocRepoMock.findOne.mockResolvedValueOnce({ ...mockDoc });
      storageMock.isTrustedObjectHost.mockReturnValue(true);
      const objectKey =
        'styles/style-uuid-1/documents/production_doc_image/sketch.png';
      const presignedUrl = `https://erp-tami-storage-dev.s3.us-east-1.amazonaws.com/${objectKey}?X-Amz-Credential=AKIA_FAKE&X-Amz-Signature=deadbeef`;

      await service.update('doc-uuid-1', {
        section1ImageUrl: presignedUrl,
      } as any);

      expect(prodDocRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ section1ImageUrl: objectKey }),
      );
    });

    it('leaves a URL for a different host untouched (never fetched, only compared)', async () => {
      prodDocRepoMock.findOne.mockResolvedValueOnce({ ...mockDoc });
      storageMock.isTrustedObjectHost.mockReturnValue(false);
      const externalUrl = 'https://cdn.example.com/image.png';

      await service.update('doc-uuid-1', {
        section1ImageUrl: externalUrl,
      } as any);

      expect(prodDocRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ section1ImageUrl: externalUrl }),
      );
    });
  });

  describe('unlinkAttachment', () => {
    it('should remove link record from style_documents without deleting original document file', async () => {
      const mockLink = { styleId: 'style-uuid-1', documentId: 'file-uuid-1' };
      styleDocRepoMock.findOne.mockResolvedValueOnce(mockLink);

      await service.unlinkAttachment('style-uuid-1', 'file-uuid-1');

      expect(styleDocRepoMock.remove).toHaveBeenCalledWith(mockLink);
      expect(docRepoMock.findOne).not.toHaveBeenCalled();
    });
  });
});
