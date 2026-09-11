import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
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
});
