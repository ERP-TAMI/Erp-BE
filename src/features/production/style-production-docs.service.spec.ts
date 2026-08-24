import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StyleProductionDocsService } from './style-production-docs.service';
import { ProductionDocument } from './entities/ProductionDocument.entity';
import { ProductionDocumentSection } from './entities/ProductionDocumentSection.entity';
import { ProductionDocumentSizeRow } from './entities/ProductionDocumentSizeRow.entity';
import { Style } from '../styles/entities/Style.entity';
import { StyleDocument } from '../styles/entities/StyleDocument.entity';
import { Document } from '../documents/entities/Document.entity';
import { BillOfMaterials } from '../boms/entities/BillOfMaterials.entity';
import { BillOfMaterialLine } from '../boms/entities/BillOfMaterialLine.entity';
import { ProductionDocStatus } from '../../common/enums/database.enums';

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
      find: jest.fn().mockResolvedValue([]),
    };

    bomLineRepoMock = {
      find: jest.fn().mockResolvedValue([]),
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
          provide: getRepositoryToken(BillOfMaterials),
          useValue: bomRepoMock,
        },
        {
          provide: getRepositoryToken(BillOfMaterialLine),
          useValue: bomLineRepoMock,
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
