import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  ConflictException,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { SaveProductOperationStepsDto } from './dto';
import { PurchaseOrder } from './entities/PurchaseOrder.entity';
import { PurchaseOrderStatusHistory } from './entities/PurchaseOrderStatusHistory.entity';
import { PurchaseOrderDocument } from './entities/PurchaseOrderDocument.entity';
import { PurchaseOrderProduct } from './entities/PurchaseOrderProduct.entity';
import { PurchaseOrderProductOperationStep } from './entities/PurchaseOrderProductOperationStep.entity';
import { PurchaseOrderProductSampleRound } from './entities/PurchaseOrderProductSampleRound.entity';
import { PurchaseOrderProductSampleImage } from './entities/PurchaseOrderProductSampleImage.entity';
import { PurchaseOrderProductDocument } from './entities/PurchaseOrderProductDocument.entity';
import { PurchaseOrderProductStatusHistory } from './entities/PurchaseOrderProductStatusHistory.entity';
import { PurchaseOrderProductColor } from './entities/PurchaseOrderProductColor.entity';
import { PurchaseOrderProductColorSize } from './entities/PurchaseOrderProductColorSize.entity';
import { Style } from '../styles/entities/Style.entity';
import { StyleOperationStep } from '../styles/entities/StyleOperationStep.entity';
import { StyleSampleRound } from '../styles/entities/StyleSampleRound.entity';
import { StyleSampleImage } from '../styles/entities/StyleSampleImage.entity';
import { StyleDocument } from '../styles/entities/StyleDocument.entity';
import { ProductionDocument } from '../production/entities/ProductionDocument.entity';
import { ProductionDocumentSizeRow } from '../production/entities/ProductionDocumentSizeRow.entity';
import { ProductionDocumentSection } from '../production/entities/ProductionDocumentSection.entity';
import { ProductionDocumentImage } from '../production/entities/ProductionDocumentImage.entity';
import { Document } from '../documents/entities/Document.entity';
import { DocumentVersion } from '../documents/entities/DocumentVersion.entity';
import { Customer } from '../master-data/entities/Customer.entity';
import {
  PoStatus,
  ProductStatus,
  DocumentPurpose,
} from '../../common/enums/database.enums';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;

  const mockPoRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
    remove: jest.fn(),
  };

  const mockHistoryRepo = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockPoDocRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockProductRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockDocRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockDocVersionRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockCustomerRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockStyleRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockImplementation((opts: any) => {
      const id = opts?.where?.id || 'd9b2d63d-a233-4f9e-a89e-2938804918e7';
      return Promise.resolve({
        id,
        styleCode: 'STYLE-002',
        styleName: 'Áo T-Shirt',
      });
    }),
    create: jest.fn().mockImplementation((dto: any) => dto),
    save: jest
      .fn()
      .mockImplementation((entity: any) => Promise.resolve(entity)),
  };

  const mockGenericRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((dto: any) => dto),
    save: jest
      .fn()
      .mockImplementation((entity: any) =>
        Promise.resolve({ id: 'mock-id', ...entity }),
      ),
    remove: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(),
  };

  let storageMock: jest.Mocked<StorageService>;
  let txDocRepoMock: { create: jest.Mock; save: jest.Mock };
  let txVersionRepoMock: { create: jest.Mock; save: jest.Mock };
  let txPoDocRepoMock: { create: jest.Mock; save: jest.Mock };
  let txProductDocRepoMock: { create: jest.Mock; save: jest.Mock };
  let txSampleRoundRepoMock: {
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let txSampleImageRepoMock: { create: jest.Mock; save: jest.Mock };

  const mockDataSource = {
    transaction: jest.fn().mockImplementation((cb: any) => {
      const manager = {
        findOne: jest.fn().mockImplementation((entity: any, options: any) => {
          if (entity === Style) {
            return Promise.resolve({
              id: options?.where?.id || 'd9b2d63d-a233-4f9e-a89e-2938804918e7',
              styleCode: 'STYLE-002',
              styleName: 'Áo T-Shirt',
            });
          }
          return Promise.resolve(null);
        }),
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((entity: any, dto: any) => {
          if (entity === PurchaseOrderProduct) {
            return mockProductRepo.create(dto);
          }
          return dto;
        }),
        save: jest
          .fn()
          .mockImplementation((entityOrTarget: any, maybeEntity: any) => {
            const target = maybeEntity || entityOrTarget;
            if (entityOrTarget === PurchaseOrderProduct || !maybeEntity) {
              mockProductRepo.save(target);
            }
            return Promise.resolve(target);
          }),
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
        remove: jest.fn().mockResolvedValue(undefined),
        getRepository: jest.fn().mockImplementation((entity: any) => {
          if (entity === Document) return txDocRepoMock;
          if (entity === DocumentVersion) return txVersionRepoMock;
          if (entity === PurchaseOrderDocument) return txPoDocRepoMock;
          if (entity === PurchaseOrderProductDocument)
            return txProductDocRepoMock;
          if (entity === PurchaseOrderProductSampleRound)
            return txSampleRoundRepoMock;
          if (entity === PurchaseOrderProductSampleImage)
            return txSampleImageRepoMock;
          return mockGenericRepo;
        }),
      };
      return cb(manager);
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    storageMock = {
      getPresignedPutUrl: jest.fn().mockResolvedValue('https://s3.example/put'),
      getPresignedGetUrl: jest.fn().mockResolvedValue('https://s3.example/get'),
      deleteObject: jest.fn(),
      headObject: jest.fn().mockResolvedValue({ exists: true }),
      getObjectBuffer: jest
        .fn()
        .mockResolvedValue(Buffer.from('%PDF-1.5 test')),
    };

    txDocRepoMock = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => ({ id: 'doc-1', ...v })),
    };
    txVersionRepoMock = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => ({ id: 'version-1', ...v })),
    };
    txPoDocRepoMock = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockResolvedValue(undefined),
    };
    txProductDocRepoMock = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockResolvedValue(undefined),
    };
    txSampleRoundRepoMock = {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation((v) => v),
      save: jest
        .fn()
        .mockImplementation((v) => Promise.resolve({ id: 'round-1', ...v })),
    };
    txSampleImageRepoMock = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest
        .fn()
        .mockImplementation((v) =>
          Promise.resolve(
            Array.isArray(v)
              ? v.map((item, idx) => ({ id: `image-${idx}`, ...item }))
              : { id: 'image-0', ...v },
          ),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: mockPoRepo,
        },
        {
          provide: getRepositoryToken(PurchaseOrderStatusHistory),
          useValue: mockHistoryRepo,
        },
        {
          provide: getRepositoryToken(PurchaseOrderDocument),
          useValue: mockPoDocRepo,
        },
        {
          provide: getRepositoryToken(PurchaseOrderProduct),
          useValue: mockProductRepo,
        },
        {
          provide: getRepositoryToken(PurchaseOrderProductOperationStep),
          useValue: mockGenericRepo,
        },
        {
          provide: getRepositoryToken(PurchaseOrderProductSampleRound),
          useValue: mockGenericRepo,
        },
        {
          provide: getRepositoryToken(PurchaseOrderProductSampleImage),
          useValue: mockGenericRepo,
        },
        {
          provide: getRepositoryToken(PurchaseOrderProductDocument),
          useValue: mockGenericRepo,
        },
        {
          provide: getRepositoryToken(PurchaseOrderProductStatusHistory),
          useValue: mockGenericRepo,
        },
        {
          provide: getRepositoryToken(PurchaseOrderProductColor),
          useValue: mockGenericRepo,
        },
        {
          provide: getRepositoryToken(PurchaseOrderProductColorSize),
          useValue: mockGenericRepo,
        },
        {
          provide: getRepositoryToken(Style),
          useValue: mockStyleRepo,
        },
        {
          provide: getRepositoryToken(StyleOperationStep),
          useValue: mockGenericRepo,
        },
        {
          provide: getRepositoryToken(StyleSampleRound),
          useValue: mockGenericRepo,
        },
        {
          provide: getRepositoryToken(StyleSampleImage),
          useValue: mockGenericRepo,
        },
        {
          provide: getRepositoryToken(StyleDocument),
          useValue: mockGenericRepo,
        },
        {
          provide: getRepositoryToken(ProductionDocument),
          useValue: mockGenericRepo,
        },
        {
          provide: getRepositoryToken(ProductionDocumentSizeRow),
          useValue: mockGenericRepo,
        },
        {
          provide: getRepositoryToken(ProductionDocumentSection),
          useValue: mockGenericRepo,
        },
        {
          provide: getRepositoryToken(ProductionDocumentImage),
          useValue: mockGenericRepo,
        },
        {
          provide: getRepositoryToken(Document),
          useValue: mockDocRepo,
        },
        {
          provide: getRepositoryToken(DocumentVersion),
          useValue: mockDocVersionRepo,
        },
        {
          provide: getRepositoryToken(Customer),
          useValue: mockCustomerRepo,
        },
        { provide: STORAGE_SERVICE, useValue: storageMock },
      ],
    }).compile();

    service = module.get<PurchaseOrdersService>(PurchaseOrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should throw ConflictException if poCode already exists', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        poCode: 'PO-001',
      });

      await expect(
        service.create({
          poCode: 'PO-001',
          customerId: 'cust-1',
          customerNameSnapshot: 'Khách hàng A',
          receivedDate: '2030-01-01',
          deadline: '2030-01-15',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if deadline is in the past', async () => {
      await expect(
        service.create({
          poCode: 'PO-PAST',
          customerId: 'cust-1',
          customerNameSnapshot: 'Khách hàng A',
          receivedDate: '2020-01-01',
          deadline: '2020-01-05',
        }),
      ).rejects.toThrow(
        'Hạn hoàn thành (deadline) không được ở trong quá khứ.',
      );
    });

    it('should throw BadRequestException if deadline is on or before receivedDate', async () => {
      await expect(
        service.create({
          poCode: 'PO-INVALID',
          customerId: 'cust-1',
          customerNameSnapshot: 'Khách hàng A',
          receivedDate: '2030-01-10',
          deadline: '2030-01-05',
        }),
      ).rejects.toThrow('Hạn hoàn thành (deadline) phải sau ngày nhận PO.');
    });

    it('should create new PO with status draft, deadline and write history', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce(null);
      mockCustomerRepo.findOne.mockResolvedValueOnce({ id: 'cust-1' });
      const now = new Date();
      const deadlineDate = new Date('2030-01-15');
      const mockCreatedPo = {
        id: 'po-100',
        poCode: 'PO-100',
        customerId: 'cust-1',
        customerNameSnapshot: 'Khách hàng A',
        receivedDate: new Date('2030-01-01'),
        deadline: deadlineDate,
        status: PoStatus.DRAFT,
        createdAt: now,
        updatedAt: now,
      };

      mockPoRepo.create.mockReturnValue(mockCreatedPo);
      mockPoRepo.save.mockResolvedValue(mockCreatedPo);
      mockHistoryRepo.create.mockReturnValue({});
      mockHistoryRepo.save.mockResolvedValue({});
      mockPoDocRepo.find.mockResolvedValue([]);
      mockProductRepo.find.mockResolvedValue([]);
      mockHistoryRepo.find.mockResolvedValue([]);

      mockPoRepo.findOne.mockResolvedValueOnce(mockCreatedPo);

      const result = await service.create({
        poCode: 'PO-100',
        customerId: 'cust-1',
        customerNameSnapshot: 'Khách hàng A',
        receivedDate: '2030-01-01',
        deadline: '2030-01-15',
      });

      expect(result.poCode).toBe('PO-100');
      expect(result.status).toBe(PoStatus.DRAFT);
      expect(mockHistoryRepo.save).toHaveBeenCalled();
    });

    it('should set customerId to null when customerNameSnapshot does not match any customer', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce(null);
      mockCustomerRepo.findOne.mockResolvedValueOnce(null);
      const now = new Date();
      const deadlineDate = new Date('2030-01-15');
      const mockCreatedPo = {
        id: 'po-101',
        poCode: 'PO-101',
        customerId: null,
        customerNameSnapshot: 'Khách hàng hoàn toàn mới',
        receivedDate: new Date('2030-01-01'),
        deadline: deadlineDate,
        status: PoStatus.DRAFT,
        createdAt: now,
        updatedAt: now,
      };

      mockPoRepo.create.mockReturnValue(mockCreatedPo);
      mockPoRepo.save.mockResolvedValue(mockCreatedPo);
      mockHistoryRepo.create.mockReturnValue({});
      mockHistoryRepo.save.mockResolvedValue({});
      mockPoDocRepo.find.mockResolvedValue([]);
      mockProductRepo.find.mockResolvedValue([]);
      mockHistoryRepo.find.mockResolvedValue([]);
      mockPoRepo.findOne.mockResolvedValueOnce(mockCreatedPo);

      const result = await service.create({
        poCode: 'PO-101',
        customerNameSnapshot: 'Khách hàng hoàn toàn mới',
        receivedDate: '2030-01-01',
        deadline: '2030-01-15',
      });

      expect(mockPoRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: null,
          customerNameSnapshot: 'Khách hàng hoàn toàn mới',
          deadline: expect.any(Date),
        }),
      );
      expect(result.poCode).toBe('PO-101');
    });
  });

  describe('updateStatus', () => {
    it('should reject step skipping from draft to closed', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        poCode: 'PO-001',
        status: PoStatus.DRAFT,
      });

      await expect(
        service.updateStatus('po-1', {
          status: PoStatus.CLOSED,
          reason: 'Lock PO',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should require a reason when transitioning to CLOSED or CANCELLED', async () => {
      mockPoRepo.findOne.mockResolvedValue({
        id: 'po-1',
        poCode: 'PO-001',
        status: PoStatus.IN_PROGRESS,
      });

      await expect(
        service.updateStatus('po-1', { status: PoStatus.CLOSED, reason: '' }),
      ).rejects.toThrow(
        'Chuyển trạng thái sang Đã khóa hoặc Đã hủy bắt buộc phải nhập lý do.',
      );
    });

    it('should transition in_progress to closed with valid reason', async () => {
      const mockPo = {
        id: 'po-1',
        poCode: 'PO-001',
        status: PoStatus.IN_PROGRESS,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPoRepo.findOne.mockResolvedValue(mockPo);
      mockPoRepo.save.mockResolvedValue(mockPo);
      mockHistoryRepo.create.mockReturnValue({});
      mockHistoryRepo.save.mockResolvedValue({});
      mockPoDocRepo.find.mockResolvedValue([]);
      mockProductRepo.find.mockResolvedValue([]);
      mockHistoryRepo.find.mockResolvedValue([]);

      const result = await service.updateStatus('po-1', {
        status: PoStatus.CLOSED,
        reason: 'Đã hoàn thành kiểm định và sản xuất',
      });

      expect(mockPoRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PoStatus.CLOSED }),
      );
      expect(result).toBeDefined();
    });

    it('should transition draft directly to in_progress', async () => {
      const mockPo = {
        id: 'po-1',
        poCode: 'PO-001',
        status: PoStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPoRepo.findOne.mockResolvedValue(mockPo);
      mockPoRepo.save.mockResolvedValue(mockPo);
      mockHistoryRepo.create.mockReturnValue({});
      mockHistoryRepo.save.mockResolvedValue({});
      mockPoDocRepo.find.mockResolvedValue([]);
      mockProductRepo.find.mockResolvedValue([]);
      mockHistoryRepo.find.mockResolvedValue([]);

      const result = await service.updateStatus('po-1', {
        status: PoStatus.IN_PROGRESS,
      });

      expect(mockPoRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PoStatus.IN_PROGRESS }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('should block updates if PO is in CLOSED status', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        poCode: 'PO-001',
        status: PoStatus.CLOSED,
      });

      await expect(
        service.update('po-1', { note: 'Thay đổi ghi chú' }),
      ).rejects.toThrow('PO đã ở trạng thái Đã khóa');
    });

    it('should throw BadRequestException if update deadline is null or empty', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        poCode: 'PO-001',
        status: PoStatus.DRAFT,
        receivedDate: '2026-09-10',
        deadline: new Date('2026-10-01'),
      });

      await expect(
        service.update('po-1', { deadline: null as any }),
      ).rejects.toThrow(
        'Hạn hoàn thành (deadline) không được để trống hoặc mang giá trị null.',
      );
    });

    it('should throw BadRequestException if update deadline is on or before receivedDate', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        poCode: 'PO-001',
        status: PoStatus.DRAFT,
        receivedDate: '2026-09-10',
      });

      await expect(
        service.update('po-1', { deadline: '2026-09-05' }),
      ).rejects.toThrow('Hạn hoàn thành (deadline) phải sau ngày nhận PO.');
    });

    it('should allow updating deadline when deadline is after receivedDate', async () => {
      const mockPo = {
        id: 'po-1',
        poCode: 'PO-001',
        status: PoStatus.DRAFT,
        receivedDate: '2026-09-10',
        deadline: null,
      };
      mockPoRepo.findOne
        .mockResolvedValueOnce(mockPo)
        .mockResolvedValueOnce({ ...mockPo, deadline: new Date('2026-10-01') });
      mockPoRepo.save.mockResolvedValueOnce({
        ...mockPo,
        deadline: new Date('2026-10-01'),
      });
      mockPoDocRepo.find.mockResolvedValue([]);
      mockProductRepo.find.mockResolvedValue([]);
      mockHistoryRepo.find.mockResolvedValue([]);

      const res = await service.update('po-1', { deadline: '2026-10-01' });
      expect(mockPoRepo.save).toHaveBeenCalled();
      expect(res.deadline).toEqual(new Date('2026-10-01'));
    });
  });

  describe('PO Products Management', () => {
    it('should add product to PO if PO is active and productCode is unique', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        status: PoStatus.DRAFT,
      });
      mockProductRepo.findOne.mockResolvedValueOnce(null);
      const mockProduct = {
        id: 'prod-1',
        purchaseOrderId: 'po-1',
        productCode: 'PROD-001',
        productName: 'Áo Polo',
        status: ProductStatus.DRAFT,
      };
      mockProductRepo.create.mockReturnValue(mockProduct);
      mockProductRepo.save.mockResolvedValue(mockProduct);
      mockHistoryRepo.create.mockReturnValue({});
      mockHistoryRepo.save.mockResolvedValue({});

      const result = await service.addProduct('po-1', {
        productCode: 'PROD-001',
        productName: 'Áo Polo',
      });

      expect(result.productCode).toBe('PROD-001');
      expect(mockProductRepo.save).toHaveBeenCalled();
    });

    it('should add product using styleCode and styleId aliases', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        status: PoStatus.DRAFT,
      });
      mockProductRepo.findOne.mockResolvedValueOnce(null);
      const mockProduct = {
        id: 'prod-2',
        purchaseOrderId: 'po-1',
        sourceStyleId: 'd9b2d63d-a233-4f9e-a89e-2938804918e7',
        productCode: 'STYLE-002',
        productName: 'Áo T-Shirt',
        materialNote: 'Đỏ',
        status: ProductStatus.DRAFT,
      };
      mockProductRepo.create.mockReturnValue(mockProduct);
      mockProductRepo.save.mockResolvedValue(mockProduct);
      mockHistoryRepo.create.mockReturnValue({});
      mockHistoryRepo.save.mockResolvedValue({});

      const result = await service.addProduct('po-1', {
        styleCode: 'STYLE-002',
        styleId: 'd9b2d63d-a233-4f9e-a89e-2938804918e7',
        colorName: 'Đỏ',
        productName: 'Áo T-Shirt',
      });

      expect(mockProductRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productCode: 'STYLE-002',
          sourceStyleId: 'd9b2d63d-a233-4f9e-a89e-2938804918e7',
          materialNote: 'Đỏ',
        }),
      );
      expect(result.productCode).toBe('STYLE-002');
    });

    it('should block adding product if PO is CLOSED', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        status: PoStatus.CLOSED,
      });

      await expect(
        service.addProduct('po-1', {
          productCode: 'PROD-001',
          productName: 'Áo Polo',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateDocumentPurpose', () => {
    it('should update document purpose and save link', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        poCode: 'PO-001',
        status: PoStatus.DRAFT,
      });
      const mockLink = {
        purchaseOrderId: 'po-1',
        documentId: 'doc-1',
        purpose: DocumentPurpose.PO_ORIGINAL,
      };
      mockPoDocRepo.findOne.mockResolvedValueOnce(mockLink);
      mockPoDocRepo.save.mockResolvedValueOnce({
        ...mockLink,
        purpose: DocumentPurpose.SAMPLE_IMAGE,
      });

      // findOne mock
      jest.spyOn(service, 'findOne').mockResolvedValueOnce({
        id: 'po-1',
        poCode: 'PO-001',
      } as any);

      const result = await service.updateDocumentPurpose(
        'po-1',
        'doc-1',
        DocumentPurpose.SAMPLE_IMAGE,
        'user-1',
      );

      expect(mockLink.purpose).toBe(DocumentPurpose.SAMPLE_IMAGE);
      expect(mockPoDocRepo.save).toHaveBeenCalledWith(mockLink);
      expect(result.id).toBe('po-1');
    });

    it('should reject update if PO is CLOSED', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        status: PoStatus.CLOSED,
      });

      await expect(
        service.updateDocumentPurpose(
          'po-1',
          'doc-1',
          DocumentPurpose.SAMPLE_IMAGE,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject update if PO is CANCELLED', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        status: PoStatus.CANCELLED,
      });

      await expect(
        service.updateDocumentPurpose(
          'po-1',
          'doc-1',
          DocumentPurpose.SAMPLE_IMAGE,
        ),
      ).rejects.toThrow(
        'Đơn hàng PO đã hủy, không thể thay đổi phân loại tài liệu.',
      );
    });
  });

  describe('Cancelled PO invariant protection', () => {
    it('should block updates if PO is CANCELLED', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        poCode: 'PO-001',
        status: PoStatus.CANCELLED,
      });

      await expect(
        service.update('po-1', { note: 'Thay đổi ghi chú' }),
      ).rejects.toThrow('Đơn hàng PO đã hủy, không thể chỉnh sửa thông tin.');
    });

    it('should block adding product if PO is CANCELLED', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        status: PoStatus.CANCELLED,
      });

      await expect(
        service.addProduct('po-1', {
          productCode: 'PROD-001',
          productName: 'Áo Polo',
        }),
      ).rejects.toThrow('Đơn hàng PO đã hủy, không thể thêm sản phẩm mới.');
    });

    it('should block presigning a document upload if PO is CANCELLED', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        status: PoStatus.CANCELLED,
      });

      await expect(
        service.presignDocument('po-1', {
          fileName: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 4,
          purpose: DocumentPurpose.OTHER,
        }),
      ).rejects.toThrow('Đơn hàng PO đã hủy, không thể tải lên tài liệu mới.');
    });

    it('should block confirming a document upload if PO is CANCELLED', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        status: PoStatus.CANCELLED,
      });

      await expect(
        service.confirmDocument('po-1', 'user-1', {
          objectKey: 'purchase-orders/po-1/documents/other/x.pdf',
          fileName: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 4,
          purpose: DocumentPurpose.OTHER,
        }),
      ).rejects.toThrow('Đơn hàng PO đã hủy, không thể tải lên tài liệu mới.');
    });
  });

  describe('presignDocument', () => {
    it('rejects a file whose extension is not in the PO allowlist', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        status: PoStatus.DRAFT,
      });

      await expect(
        service.presignDocument('po-1', {
          fileName: 'payload.exe',
          mimeType: 'application/pdf',
          sizeBytes: 4,
          purpose: DocumentPurpose.OTHER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('builds an object key scoped to the PO and purpose, and returns the presigned PUT url', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        status: PoStatus.DRAFT,
      });

      const result = await service.presignDocument('po-1', {
        fileName: 'contract.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        purpose: DocumentPurpose.PO_ORIGINAL,
      });

      expect(result.objectKey).toMatch(
        /^purchase-orders\/po-1\/documents\/po_original\/[0-9a-f-]+\.pdf$/,
      );
      expect(result.uploadUrl).toBe('https://s3.example/put');
      expect(storageMock.getPresignedPutUrl).toHaveBeenCalledWith(
        result.objectKey,
        'application/pdf',
        expect.any(Number),
      );
    });
  });

  describe('confirmDocument', () => {
    const confirmDto = {
      objectKey: 'purchase-orders/po-1/documents/other/x.pdf',
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 13,
      purpose: DocumentPurpose.OTHER,
    };

    it('throws if the object was not actually uploaded to S3', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        status: PoStatus.DRAFT,
      });
      storageMock.headObject.mockResolvedValueOnce({ exists: false });

      await expect(
        service.confirmDocument('po-1', 'user-1', confirmDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if the uploaded bytes fail the magic-bytes check for the declared extension', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        status: PoStatus.DRAFT,
      });
      storageMock.getObjectBuffer.mockResolvedValueOnce(
        Buffer.from('not actually a pdf'),
      );

      await expect(
        service.confirmDocument('po-1', 'user-1', confirmDto),
      ).rejects.toThrow(BadRequestException);
      expect(txDocRepoMock.save).not.toHaveBeenCalled();
    });

    it('creates document, version and PO link inside one transaction, resolving a fresh presigned URL', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        status: PoStatus.DRAFT,
      });

      const result = await service.confirmDocument(
        'po-1',
        'user-1',
        confirmDto,
      );

      expect(txDocRepoMock.save).toHaveBeenCalled();
      expect(txVersionRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ storageKey: confirmDto.objectKey }),
      );
      expect(txPoDocRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          purchaseOrderId: 'po-1',
          purpose: DocumentPurpose.OTHER,
        }),
      );
      expect(result.fileUrl).toBe('https://s3.example/get');
    });
  });

  describe('validateFileMagicBytes', () => {
    it('should accept valid PDF magic bytes', () => {
      const validPdf = Buffer.from('%PDF-1.5 test');
      expect(() =>
        service.validateFileMagicBytes('.pdf', validPdf),
      ).not.toThrow();
    });

    it('should reject fake PDF without %PDF header', () => {
      const fakePdf = Buffer.from('MZ\x90\x00 executable payload');
      expect(() => service.validateFileMagicBytes('.pdf', fakePdf)).toThrow(
        'Tệp không phải là định dạng PDF hợp lệ (chữ ký magic bytes không khớp).',
      );
    });

    it('should accept valid PNG signature', () => {
      const validPng = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
      ]);
      expect(() =>
        service.validateFileMagicBytes('.png', validPng),
      ).not.toThrow();
    });

    it('should reject fake PNG signature', () => {
      const fakePng = Buffer.from('not a png');
      expect(() => service.validateFileMagicBytes('.png', fakePng)).toThrow(
        'Tệp không phải là định dạng PNG hợp lệ (chữ ký magic bytes không khớp).',
      );
    });

    it('should accept valid JPEG header', () => {
      const validJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      expect(() =>
        service.validateFileMagicBytes('.jpg', validJpg),
      ).not.toThrow();
    });

    it('should reject fake JPEG header', () => {
      const fakeJpg = Buffer.from('fake jpg');
      expect(() => service.validateFileMagicBytes('.jpg', fakeJpg)).toThrow(
        'Tệp không phải là định dạng JPEG/JPG hợp lệ (chữ ký magic bytes không khớp).',
      );
    });

    it('should accept valid DOCX / XLSX ZIP signature PK', () => {
      const validZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
      expect(() =>
        service.validateFileMagicBytes('.docx', validZip),
      ).not.toThrow();
      expect(() =>
        service.validateFileMagicBytes('.xlsx', validZip),
      ).not.toThrow();
    });

    it('should reject fake DOCX without PK header', () => {
      const fakeDocx = Buffer.from('fake docx');
      expect(() => service.validateFileMagicBytes('.docx', fakeDocx)).toThrow(
        'Tệp không phải là định dạng .DOCX hợp lệ (chữ ký magic bytes không khớp).',
      );
    });

    it('should reject text file containing disguised <script> tag', () => {
      const maliciousTxt = Buffer.from('Hello world <script>alert(1)</script>');
      expect(() =>
        service.validateFileMagicBytes('.txt', maliciousTxt),
      ).toThrow('Tệp văn bản ".txt" chứa mã HTML/Script không được phép.');
    });

    it('should reject text file containing null bytes', () => {
      const binaryTxt = Buffer.from('Binary\x00data');
      expect(() => service.validateFileMagicBytes('.txt', binaryTxt)).toThrow(
        'Tệp văn bản ".txt" chứa ký tự nhị phân không hợp lệ.',
      );
    });

    it('should accept clean text / CSV file', () => {
      const cleanCsv = Buffer.from('col1,col2,col3\nval1,val2,val3');
      expect(() =>
        service.validateFileMagicBytes('.csv', cleanCsv),
      ).not.toThrow();
    });
  });

  describe('presignProductDocument', () => {
    it('rejects a file whose extension is not in the PO allowlist', async () => {
      mockProductRepo.findOne.mockResolvedValueOnce({
        id: 'prod-1',
        purchaseOrderId: 'po-1',
        status: ProductStatus.DRAFT,
      });

      await expect(
        service.presignProductDocument('po-1', 'prod-1', {
          fileName: 'payload.exe',
          mimeType: 'application/pdf',
          sizeBytes: 4,
          purpose: DocumentPurpose.OTHER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the product is CLOSED', async () => {
      mockProductRepo.findOne.mockResolvedValueOnce({
        id: 'prod-1',
        purchaseOrderId: 'po-1',
        status: ProductStatus.CLOSED,
      });

      await expect(
        service.presignProductDocument('po-1', 'prod-1', {
          fileName: 'contract.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 4,
          purpose: DocumentPurpose.OTHER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('builds an object key scoped to the PO + product + purpose, and returns the presigned PUT url', async () => {
      mockProductRepo.findOne.mockResolvedValueOnce({
        id: 'prod-1',
        purchaseOrderId: 'po-1',
        status: ProductStatus.DRAFT,
      });

      const result = await service.presignProductDocument('po-1', 'prod-1', {
        fileName: 'techpack.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        purpose: DocumentPurpose.TECH_PACK,
      });

      expect(result.objectKey).toMatch(
        /^purchase-orders\/po-1\/products\/prod-1\/documents\/tech_pack\/[0-9a-f-]+\.pdf$/,
      );
      expect(result.uploadUrl).toBe('https://s3.example/put');
    });
  });

  describe('confirmProductDocument', () => {
    const confirmDto = {
      objectKey: 'purchase-orders/po-1/products/prod-1/documents/other/x.pdf',
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 13,
      purpose: DocumentPurpose.OTHER,
    };

    it('throws if the object was not actually uploaded to S3', async () => {
      mockProductRepo.findOne.mockResolvedValueOnce({
        id: 'prod-1',
        purchaseOrderId: 'po-1',
        status: ProductStatus.DRAFT,
      });
      storageMock.headObject.mockResolvedValueOnce({ exists: false });

      await expect(
        service.confirmProductDocument('po-1', 'prod-1', 'user-1', confirmDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if the uploaded bytes fail the magic-bytes check', async () => {
      mockProductRepo.findOne.mockResolvedValueOnce({
        id: 'prod-1',
        purchaseOrderId: 'po-1',
        status: ProductStatus.DRAFT,
      });
      storageMock.getObjectBuffer.mockResolvedValueOnce(
        Buffer.from('not actually a pdf'),
      );

      await expect(
        service.confirmProductDocument('po-1', 'prod-1', 'user-1', confirmDto),
      ).rejects.toThrow(BadRequestException);
      expect(txDocRepoMock.save).not.toHaveBeenCalled();
    });

    it('creates document, version and a PRODUCT-scoped link (not a PO-level link) in one transaction', async () => {
      mockProductRepo.findOne.mockResolvedValueOnce({
        id: 'prod-1',
        purchaseOrderId: 'po-1',
        status: ProductStatus.DRAFT,
      });

      const result = await service.confirmProductDocument(
        'po-1',
        'prod-1',
        'user-1',
        confirmDto,
      );

      expect(txDocRepoMock.save).toHaveBeenCalled();
      expect(txVersionRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ storageKey: confirmDto.objectKey }),
      );
      expect(txProductDocRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          purpose: DocumentPurpose.OTHER,
          sourcePoDocument: false,
        }),
      );
      // Regression guard: this is a product-scoped upload, it must not also
      // create a PurchaseOrderDocument (PO-level) link.
      expect(txPoDocRepoMock.save).not.toHaveBeenCalled();
      expect(result.fileUrl).toBe('https://s3.example/get');
      expect(result.productId).toBe('prod-1');
    });
  });

  describe('confirmProductDocumentVersion', () => {
    const confirmDto = {
      objectKey: 'purchase-orders/po-1/products/prod-1/documents/other/y.pdf',
      fileName: 'y.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 13,
      purpose: DocumentPurpose.OTHER,
    };

    it('throws if the document is not linked to this product', async () => {
      mockProductRepo.findOne.mockResolvedValueOnce({
        id: 'prod-1',
        purchaseOrderId: 'po-1',
        status: ProductStatus.DRAFT,
      });
      mockGenericRepo.findOne.mockResolvedValueOnce(null); // productDocRepo link lookup

      await expect(
        service.confirmProductDocumentVersion(
          'po-1',
          'prod-1',
          'doc-1',
          'user-1',
          confirmDto,
        ),
      ).rejects.toThrow('Tài liệu không thuộc sản phẩm này.');
    });

    it('appends a new version with an incremented versionNo', async () => {
      mockProductRepo.findOne.mockResolvedValueOnce({
        id: 'prod-1',
        purchaseOrderId: 'po-1',
        status: ProductStatus.DRAFT,
      });
      mockGenericRepo.findOne.mockResolvedValueOnce({
        productId: 'prod-1',
        documentId: 'doc-1',
        purpose: DocumentPurpose.OTHER,
        sourcePoDocument: false,
        linkedAt: new Date('2026-01-01'),
      });
      mockDocRepo.findOne.mockResolvedValueOnce({
        id: 'doc-1',
        documentCode: 'DOC-1',
        title: 'x.pdf',
      });
      mockDocVersionRepo.find.mockResolvedValueOnce([
        { id: 'v1', versionNo: 1, documentId: 'doc-1' },
      ]);

      const result = await service.confirmProductDocumentVersion(
        'po-1',
        'prod-1',
        'doc-1',
        'user-1',
        confirmDto,
      );

      expect(txVersionRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ documentId: 'doc-1', versionNo: 2 }),
      );
      expect(result.currentVersionNo).toBe(2);
      expect(result.versions).toHaveLength(2);
    });
  });

  describe('saveProductOperationSteps', () => {
    it('assigns order_index from the submitted array position, even when grouped steps carry duplicate per-group client orderIndex values', async () => {
      // Regression test: order_index has a UNIQUE(product_id, order_index) DB
      // constraint. A nested/grouped steps UI naturally numbers each group's
      // children starting back at 0 — if the service trusted step.orderIndex
      // as-is, two groups' first child would collide and the save would 500.
      mockProductRepo.findOne.mockResolvedValueOnce({
        id: 'prod-1',
        status: ProductStatus.DRAFT,
      });

      const dto = {
        steps: [
          { stepName: 'Group A', isGroup: true, orderIndex: 0 },
          { stepName: 'A - step 1', orderIndex: 0 },
          { stepName: 'Group B', isGroup: true, orderIndex: 1 },
          { stepName: 'B - step 1', orderIndex: 0 },
        ],
      } as any;

      const result = await service.saveProductOperationSteps(
        'prod-1',
        dto,
        'user-1',
      );

      expect(result.map((s: any) => s.orderIndex)).toEqual([0, 1, 2, 3]);
    });

    it('persists cmBaseDays onto the product when provided', async () => {
      mockProductRepo.findOne.mockResolvedValueOnce({
        id: 'prod-1',
        status: ProductStatus.DRAFT,
        as3bCmBaseDays: 30,
      });

      await service.saveProductOperationSteps(
        'prod-1',
        { steps: [], cmBaseDays: 45 } as any,
        'user-1',
      );

      expect(mockProductRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ as3bCmBaseDays: 45 }),
      );
    });

    it('rejects when the product is CLOSED', async () => {
      mockProductRepo.findOne.mockResolvedValueOnce({
        id: 'prod-1',
        status: ProductStatus.CLOSED,
      });

      await expect(
        service.saveProductOperationSteps('prod-1', { steps: [] } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('SaveProductOperationStepsDto whitelist validation (regression)', () => {
    // Regression test for a bug where `steps` had no class-validator
    // decorators at all, so the app's global ValidationPipe
    // ({ whitelist: true, forbidNonWhitelisted: true }, see src/main.ts)
    // rejected every request with "property steps should not exist" —
    // the save-operation-steps endpoint was completely unusable.
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });

    it('accepts a well-formed nested steps array without stripping it', async () => {
      const body = {
        steps: [
          { stepName: 'Group A', isGroup: true },
          { stepName: 'A - step 1', parentStepId: undefined },
        ],
        cmBaseDays: 30,
      };

      const result = await pipe.transform(body, {
        type: 'body',
        metatype: SaveProductOperationStepsDto,
      });

      expect(result).toBeInstanceOf(SaveProductOperationStepsDto);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].stepName).toBe('Group A');
    });

    it('rejects cmBaseDays of 0 with a clean validation error instead of a DB check-constraint 500', async () => {
      const body = { steps: [], cmBaseDays: 0 };

      await expect(
        pipe.transform(body, {
          type: 'body',
          metatype: SaveProductOperationStepsDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createProductSampleRound', () => {
    it('persists the ordered images list instead of silently dropping it', async () => {
      mockProductRepo.findOne.mockResolvedValueOnce({ id: 'prod-1' });
      txSampleRoundRepoMock.count.mockResolvedValueOnce(0);

      const result = await service.createProductSampleRound(
        'prod-1',
        {
          feedback: 'Fit ok',
          images: [
            { documentVersionId: 'ver-1', colorName: 'Red' },
            { documentVersionId: 'ver-2', colorName: 'Blue' },
          ],
        } as any,
        'user-1',
      );

      expect(txSampleImageRepoMock.save).toHaveBeenCalledWith([
        expect.objectContaining({
          documentVersionId: 'ver-1',
          colorNameSnapshot: 'Red',
          orderIndex: 0,
        }),
        expect.objectContaining({
          documentVersionId: 'ver-2',
          colorNameSnapshot: 'Blue',
          orderIndex: 1,
        }),
      ]);
      expect(result.images).toHaveLength(2);
    });

    it('skips image entries with no documentVersionId instead of inserting an invalid row', async () => {
      mockProductRepo.findOne.mockResolvedValueOnce({ id: 'prod-1' });
      txSampleRoundRepoMock.count.mockResolvedValueOnce(0);

      const result = await service.createProductSampleRound(
        'prod-1',
        { images: [{ colorName: 'Red' }] } as any,
        'user-1',
      );

      expect(txSampleImageRepoMock.save).not.toHaveBeenCalled();
      expect(result.images).toEqual([]);
    });

    it('creates a round with no images when none are provided', async () => {
      mockProductRepo.findOne.mockResolvedValueOnce({ id: 'prod-1' });
      txSampleRoundRepoMock.count.mockResolvedValueOnce(2);

      const result = await service.createProductSampleRound(
        'prod-1',
        { feedback: '2nd round' } as any,
        'user-1',
      );

      expect(result.roundNo).toBe(3);
      expect(result.images).toEqual([]);
    });
  });
});
