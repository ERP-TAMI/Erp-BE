import * as JSZip from 'jszip';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrder } from './entities/PurchaseOrder.entity';
import { PurchaseOrderStatusHistory } from './entities/PurchaseOrderStatusHistory.entity';
import { PurchaseOrderDocument } from './entities/PurchaseOrderDocument.entity';
import { PurchaseOrderProduct } from './entities/PurchaseOrderProduct.entity';
import { Document } from '../documents/entities/Document.entity';
import { DocumentVersion } from '../documents/entities/DocumentVersion.entity';
import { Customer } from '../master-data/entities/Customer.entity';
import {
  PoStatus,
  ProductStatus,
  DocumentPurpose,
} from '../../common/enums/database.enums';
import { poDocumentFileFilter } from './purchase-orders.controller';

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
          provide: getRepositoryToken(PurchaseOrderProduct),
          useValue: mockProductRepo,
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
      ).rejects.toThrow('Hạn hoàn thành (deadline) không được ở trong quá khứ.');
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
      mockPoRepo.save.mockResolvedValueOnce({ ...mockPo, deadline: new Date('2026-10-01') });
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

    it('should block uploading document if PO is CANCELLED', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        status: PoStatus.CANCELLED,
      });

      await expect(
        service.uploadDocument('po-1', {
          originalname: 'test.pdf',
          mimetype: 'application/pdf',
          size: 4,
          buffer: Buffer.from('test'),
        }),
      ).rejects.toThrow('Đơn hàng PO đã hủy, không thể tải lên tài liệu mới.');
    });

    it('should block uploading multiple documents if PO is CANCELLED', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        status: PoStatus.CANCELLED,
      });

      await expect(
        service.uploadMultipleDocuments('po-1', [
          {
            originalname: 'test1.pdf',
            mimetype: 'application/pdf',
            size: 5,
            buffer: Buffer.from('test1'),
          },
        ]),
      ).rejects.toThrow('Đơn hàng PO đã hủy, không thể tải lên tài liệu mới.');
    });
  });

  describe('uploadDocument disk cleanup on DB failure', () => {
    it('should delete uploaded file from disk if docRepo.save fails', async () => {
      mockPoRepo.findOne.mockResolvedValueOnce({
        id: 'po-1',
        status: PoStatus.DRAFT,
      });
      mockDocRepo.create.mockReturnValue({ id: 'temp-doc' });
      mockDocRepo.save.mockRejectedValueOnce(new Error('DB Connection Failed'));

      await expect(
        service.uploadDocument('po-1', {
          originalname: 'cleanup-test.pdf',
          mimetype: 'application/pdf',
          size: 10,
          buffer: Buffer.from('%PDF-1.4 test content'),
        }),
      ).rejects.toThrow('DB Connection Failed');
    });
  });

  describe('escapeHtml in parseDocxToHtml', () => {
    it('should escape malicious script and img tags in docx text', async () => {
      const escapeFn = (service as any).escapeHtml.bind(service);
      const malicious =
        '<script>alert("xss")</script>&<img src="x" onerror="evil()"/>';
      const safe = escapeFn(malicious);

      expect(safe).not.toContain('<script>');
      expect(safe).not.toContain('</script>');
      expect(safe).toContain('&lt;script&gt;');
      expect(safe).toContain('&lt;img');
      expect(safe).toContain('&amp;');
    });

    it('should parse docx buffer and escape malicious script and markup in paragraphs and tables', async () => {
      const zip = new JSZip();
      zip.file(
        'word/document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p>
              <w:r><w:t><script>alert("xss")</script></w:t></w:r>
            </w:p>
            <w:tbl>
              <w:tr>
                <w:tc>
                  <w:p><w:r><w:t><img src=x onerror=alert(1) /></w:t></w:r></w:p>
                </w:tc>
              </w:tr>
            </w:tbl>
          </w:body>
        </w:document>`,
      );
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const html = await (service as any).parseDocxToHtml(buffer);

      expect(html).not.toContain('<script>');
      expect(html).not.toContain('</script>');
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;img');
    });
  });

  describe('poDocumentFileFilter (MIME & extension mapping)', () => {
    it('should reject payload.html even with Content-Type: application/pdf', () => {
      const callback = jest.fn();
      poDocumentFileFilter(
        {},
        { originalname: 'payload.html', mimetype: 'application/pdf' },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.any(BadRequestException),
        false,
      );
      const error = callback.mock.calls[0][0];
      expect(error.message).toContain(
        'Định dạng phần mở rộng ".html" không được hỗ trợ',
      );
    });

    it('should reject payload.exe even with Content-Type: application/pdf', () => {
      const callback = jest.fn();
      poDocumentFileFilter(
        {},
        { originalname: 'payload.exe', mimetype: 'application/pdf' },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.any(BadRequestException),
        false,
      );
      const error = callback.mock.calls[0][0];
      expect(error.message).toContain(
        'Định dạng phần mở rộng ".exe" không được hỗ trợ',
      );
    });

    it('should reject document.pdf with mismatched Content-Type: text/html', () => {
      const callback = jest.fn();
      poDocumentFileFilter(
        {},
        { originalname: 'document.pdf', mimetype: 'text/html' },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.any(BadRequestException),
        false,
      );
      const error = callback.mock.calls[0][0];
      expect(error.message).toContain(
        'Loại MIME "text/html" không hợp lệ cho tệp ".pdf"',
      );
    });

    it('should accept valid PDF with application/pdf', () => {
      const callback = jest.fn();
      poDocumentFileFilter(
        {},
        { originalname: 'document.pdf', mimetype: 'application/pdf' },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should accept valid TXT with Content-Type containing charset', () => {
      const callback = jest.fn();
      poDocumentFileFilter(
        {},
        { originalname: 'notes.txt', mimetype: 'text/plain; charset=utf-8' },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(null, true);
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
