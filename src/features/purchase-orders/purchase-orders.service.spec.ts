import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrder } from './entities/PurchaseOrder.entity';
import { PurchaseOrderStatusHistory } from './entities/PurchaseOrderStatusHistory.entity';
import { PurchaseOrderDocument } from './entities/PurchaseOrderDocument.entity';
import { Document } from '../documents/entities/Document.entity';
import { PoStatus } from '../../common/enums/database.enums';

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

  const mockDocRepo = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
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
          provide: getRepositoryToken(Document),
          useValue: mockDocRepo,
        },
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
          receivedDate: '2026-09-07',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create new PO with status draft and write history', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce(null);
      const now = new Date();
      const mockCreatedPo = {
        id: 'po-100',
        poCode: 'PO-100',
        customerId: 'cust-1',
        customerNameSnapshot: 'Khách hàng A',
        receivedDate: now,
        status: PoStatus.DRAFT,
        createdAt: now,
        updatedAt: now,
      };

      mockPoRepo.create.mockReturnValue(mockCreatedPo);
      mockPoRepo.save.mockResolvedValue(mockCreatedPo);
      mockHistoryRepo.create.mockReturnValue({});
      mockHistoryRepo.save.mockResolvedValue({});
      mockPoDocRepo.find.mockResolvedValue([]);
      mockHistoryRepo.find.mockResolvedValue([]);

      mockPoRepo.findOne.mockResolvedValueOnce(mockCreatedPo);

      const result = await service.create({
        poCode: 'PO-100',
        customerId: 'cust-1',
        customerNameSnapshot: 'Khách hàng A',
        receivedDate: '2026-09-07',
      });

      expect(result.poCode).toBe('PO-100');
      expect(result.status).toBe(PoStatus.DRAFT);
      expect(mockHistoryRepo.save).toHaveBeenCalled();
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
          reason: 'Finalize',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should require a reason when transitioning to CLOSED or CANCELLED', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        poCode: 'PO-001',
        status: PoStatus.IN_PROGRESS,
      });

      await expect(
        service.updateStatus('po-1', { status: PoStatus.CLOSED, reason: '' }),
      ).rejects.toThrow(
        'Chuyển trạng thái sang Final hoặc Đã hủy bắt buộc phải nhập lý do.',
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
      ).rejects.toThrow('PO đã ở trạng thái Final (đã khóa)');
    });
  });

  describe('unlinkDocument', () => {
    it('should remove junction link record without touching master document entity', async () => {
      const mockLink = { purchaseOrderId: 'po-1', documentId: 'doc-1' };
      mockPoDocRepo.findOne.mockResolvedValueOnce(mockLink);

      await service.unlinkDocument('po-1', 'doc-1');

      expect(mockPoDocRepo.remove).toHaveBeenCalledWith(mockLink);
      expect(mockDocRepo.find).not.toHaveBeenCalled();
    });
  });
});
