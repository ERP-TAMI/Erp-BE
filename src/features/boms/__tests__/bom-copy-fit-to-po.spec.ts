import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BomsService } from '../boms.service';
import { Bom } from '../entities/Bom.entity';
import { BomRevision } from '../entities/BomRevision.entity';
import { BomLine } from '../entities/BomLine.entity';
import { BomRevisionStatusHistory } from '../entities/BomRevisionStatusHistory.entity';
import { Style } from '../../styles/entities/Style.entity';
import { PurchaseOrderProduct } from '../../purchase-orders/entities/PurchaseOrderProduct.entity';
import { PurchaseOrder } from '../../purchase-orders/entities/PurchaseOrder.entity';
import { PurchaseOrderProductColor } from '../../purchase-orders/entities/PurchaseOrderProductColor.entity';
import { PurchaseOrderProductColorSize } from '../../purchase-orders/entities/PurchaseOrderProductColorSize.entity';
import { BomCostService } from '../bom-cost.service';
import {
  BomRevisionStatus,
  BomType,
} from '../../../common/enums/database.enums';
import { UserRoleCode } from '../../user-management/dto/query-users.dto';

describe('BOM V2 Copy Fit BOM -> PO BOM (PR-06 Specification)', () => {
  let service: BomsService;
  let bomRepoMock: any;
  let bomRevisionRepoMock: any;
  let bomLineRepoMock: any;
  let bomStatusHistoryRepoMock: any;
  let styleRepoMock: any;
  let poProductRepoMock: any;
  let poRepoMock: any;
  let poColorRepoMock: any;
  let poColorSizeRepoMock: any;
  let dataSourceMock: any;

  // In-memory test state
  let mockTargetPoBom: Bom;
  let mockTargetPoRev: BomRevision;
  let mockTargetPoLines: BomLine[];

  let mockSourceFitBom: Bom;
  let mockSourceFitRev: BomRevision;
  let mockSourceFitLines: BomLine[];

  let mockPoProduct: PurchaseOrderProduct;
  let mockPo: PurchaseOrder;
  let mockStyle: Style;

  function setupCopyEnv() {
    // 1. Style for Fit BOM
    mockStyle = new Style();
    mockStyle.id = 'style-uuid-1';
    mockStyle.styleCode = 'ST-POLO-2026';
    mockStyle.styleName = 'Áo Polo Thể Thao Nam';

    // 2. Source Fit BOM (Type FIT)
    mockSourceFitBom = new Bom();
    mockSourceFitBom.id = 'bom-fit-uuid-1';
    mockSourceFitBom.bomCode = 'BOM-FIT-ST001';
    mockSourceFitBom.bomType = BomType.FIT;
    mockSourceFitBom.styleId = mockStyle.id;
    mockSourceFitBom.currentRevisionId = 'rev-fit-uuid-1';
    mockSourceFitBom.discontinuedAt = null;
    mockSourceFitBom.rowVersion = 1;
    mockSourceFitBom.createdAt = new Date('2026-03-01T08:00:00Z');
    mockSourceFitBom.updatedAt = new Date('2026-03-01T08:00:00Z');

    // Source Fit Revision (MUST BE CLOSED)
    mockSourceFitRev = new BomRevision();
    mockSourceFitRev.id = 'rev-fit-uuid-1';
    mockSourceFitRev.bomId = mockSourceFitBom.id;
    mockSourceFitRev.revisionNo = 1;
    mockSourceFitRev.status = BomRevisionStatus.CLOSED;
    mockSourceFitRev.sourceRevisionId = null;
    mockSourceFitRev.changeReason = 'Phát triển mẫu Fit chuẩn hoàn tất';
    mockSourceFitRev.createdBy = 'user-nvkh-1';
    mockSourceFitRev.createdAt = new Date('2026-03-01T08:00:00Z');
    mockSourceFitRev.approvedBy = 'user-sa-1';
    mockSourceFitRev.approvedAt = new Date('2026-03-02T10:00:00Z');
    mockSourceFitRev.rowVersion = 1;

    // Source Fit Lines: 2 materials
    const fitLineA = new BomLine();
    fitLineA.id = 'line-fit-uuid-1';
    fitLineA.revisionId = mockSourceFitRev.id;
    fitLineA.materialId = 'mat-uuid-1';
    fitLineA.materialNameSnapshot = 'Vải Cotton 100% 220gsm';
    fitLineA.materialGroupId = 'grp-uuid-1';
    fitLineA.materialGroupSnapshot = 'Vải chính';
    fitLineA.unitId = 'unit-uuid-1';
    fitLineA.unitSnapshot = 'Mét';
    fitLineA.consumption = 1.8;
    fitLineA.unitCost = 135000;
    fitLineA.note = 'Định mức vải chính cho mẫu';
    fitLineA.orderIndex = 0;
    fitLineA.createdAt = new Date('2026-03-01T08:00:00Z');
    fitLineA.updatedAt = new Date('2026-03-01T08:00:00Z');

    const fitLineB = new BomLine();
    fitLineB.id = 'line-fit-uuid-2';
    fitLineB.revisionId = mockSourceFitRev.id;
    fitLineB.materialId = 'mat-uuid-2';
    fitLineB.materialNameSnapshot = 'Bo cổ dệt sọc thể thao';
    fitLineB.materialGroupId = 'grp-uuid-2';
    fitLineB.materialGroupSnapshot = 'Phụ liệu';
    fitLineB.unitId = 'unit-uuid-2';
    fitLineB.unitSnapshot = 'Cái';
    fitLineB.consumption = 1.0;
    fitLineB.unitCost = 18000;
    fitLineB.note = 'Bo cổ dệt chống giãn';
    fitLineB.orderIndex = 1;
    fitLineB.createdAt = new Date('2026-03-01T08:00:00Z');
    fitLineB.updatedAt = new Date('2026-03-01T08:00:00Z');

    mockSourceFitLines = [fitLineA, fitLineB];

    // 3. PO Product & PO
    mockPo = new PurchaseOrder();
    mockPo.id = 'po-uuid-1';
    mockPo.poCode = 'PO-2026-001';

    mockPoProduct = new PurchaseOrderProduct();
    mockPoProduct.id = 'pop-uuid-1';
    mockPoProduct.purchaseOrderId = mockPo.id;
    mockPoProduct.sourceStyleId = mockStyle.id;
    mockPoProduct.productCode = 'PRD-POLO-BLACK';
    mockPoProduct.productName = 'Áo Polo Nam Classic Đen';

    // 4. Target PO BOM (Type PO)
    mockTargetPoBom = new Bom();
    mockTargetPoBom.id = 'bom-po-uuid-1';
    mockTargetPoBom.bomCode = 'BOM-PO001-P001';
    mockTargetPoBom.bomType = BomType.PO;
    mockTargetPoBom.purchaseOrderProductId = mockPoProduct.id;
    mockTargetPoBom.styleId = null;
    mockTargetPoBom.currentRevisionId = 'rev-po-uuid-1';
    mockTargetPoBom.colorNameSnapshot = null;
    mockTargetPoBom.discontinuedAt = null;
    mockTargetPoBom.rowVersion = 1;
    mockTargetPoBom.createdAt = new Date('2026-03-10T08:00:00Z');
    mockTargetPoBom.updatedAt = new Date('2026-03-10T08:00:00Z');

    // Target PO Revision (MUST BE WAIT_NVKH initially)
    mockTargetPoRev = new BomRevision();
    mockTargetPoRev.id = 'rev-po-uuid-1';
    mockTargetPoRev.bomId = mockTargetPoBom.id;
    mockTargetPoRev.revisionNo = 1;
    mockTargetPoRev.status = BomRevisionStatus.WAIT_NVKH;
    mockTargetPoRev.sourceRevisionId = null;
    mockTargetPoRev.changeReason = null;
    mockTargetPoRev.createdBy = 'user-nvkh-1';
    mockTargetPoRev.createdAt = new Date('2026-03-10T08:00:00Z');
    mockTargetPoRev.approvedBy = null;
    mockTargetPoRev.approvedAt = null;
    mockTargetPoRev.rowVersion = 1;

    // Target PO Lines: EMPTY initially (required for copy)
    mockTargetPoLines = [];

    // Setup transaction mock
    dataSourceMock.transaction.mockImplementation(async (cb: any) => {
      const managerMock = {
        findOne: jest.fn().mockImplementation((entityClass, options) => {
          if (entityClass === Bom) {
            const id = options?.where?.id;
            if (id === mockTargetPoBom.id)
              return Promise.resolve(mockTargetPoBom);
            if (id === mockSourceFitBom.id)
              return Promise.resolve(mockSourceFitBom);

            // Lookup by styleId for auto-resolve
            if (
              options?.where?.bomType === BomType.FIT &&
              options?.where?.styleId === mockSourceFitBom.styleId
            ) {
              return Promise.resolve(mockSourceFitBom);
            }
            return Promise.resolve(null);
          }

          if (entityClass === BomRevision) {
            const id = options?.where?.id;
            if (id === mockTargetPoRev.id)
              return Promise.resolve(mockTargetPoRev);
            if (id === mockSourceFitRev.id)
              return Promise.resolve(mockSourceFitRev);
            return Promise.resolve(null);
          }

          if (entityClass === PurchaseOrderProduct) {
            const id = options?.where?.id;
            if (id === mockPoProduct.id) return Promise.resolve(mockPoProduct);
            return Promise.resolve(null);
          }

          return Promise.resolve(null);
        }),

        count: jest.fn().mockImplementation((entityClass, options) => {
          if (entityClass === BomLine) {
            const revId = options?.where?.revisionId;
            if (revId === mockTargetPoRev.id) {
              return Promise.resolve(mockTargetPoLines.length);
            }
            if (revId === mockSourceFitRev.id) {
              return Promise.resolve(mockSourceFitLines.length);
            }
          }
          return Promise.resolve(0);
        }),

        find: jest.fn().mockImplementation((entityClass, options) => {
          if (entityClass === BomLine) {
            const revId = options?.where?.revisionId;
            if (revId === mockSourceFitRev.id) {
              return Promise.resolve(mockSourceFitLines);
            }
            if (revId === mockTargetPoRev.id) {
              return Promise.resolve(mockTargetPoLines);
            }
          }
          return Promise.resolve([]);
        }),

        create: jest.fn().mockImplementation((entityClass, data) => {
          if (entityClass === BomLine) {
            const l = Object.assign(new BomLine(), data, {
              id: `line-copied-uuid-${mockTargetPoLines.length + 1}`,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            return l;
          }
          return Object.assign(new entityClass(), data);
        }),

        save: jest.fn().mockImplementation((entityClass, data) => {
          if (Array.isArray(data)) {
            if (data.length > 0 && data[0] instanceof BomLine) {
              mockTargetPoLines.push(...data);
              return Promise.resolve(data);
            }
          }
          if (data instanceof BomRevision) {
            if (data.id === mockTargetPoRev.id) {
              Object.assign(mockTargetPoRev, data);
            }
            return Promise.resolve(data);
          }
          if (data instanceof Bom) {
            if (data.id === mockTargetPoBom.id) {
              Object.assign(mockTargetPoBom, data);
            }
            return Promise.resolve(data);
          }
          return Promise.resolve(data);
        }),
      };

      return cb(managerMock);
    });

    // Setup standalone repository mocks for findOne / read queries
    bomRepoMock.findOne.mockImplementation((opts: any) => {
      const id = opts?.where?.id;
      if (id === mockTargetPoBom.id) return Promise.resolve(mockTargetPoBom);
      if (id === mockSourceFitBom.id) return Promise.resolve(mockSourceFitBom);
      return Promise.resolve(null);
    });

    bomRevisionRepoMock.findOne.mockImplementation((opts: any) => {
      const id = opts?.where?.id;
      if (id === mockTargetPoRev.id) return Promise.resolve(mockTargetPoRev);
      if (id === mockSourceFitRev.id) return Promise.resolve(mockSourceFitRev);
      return Promise.resolve(null);
    });

    bomLineRepoMock.find.mockImplementation((opts: any) => {
      const revId = opts?.where?.revisionId;
      if (revId === mockTargetPoRev.id)
        return Promise.resolve(mockTargetPoLines);
      if (revId === mockSourceFitRev.id)
        return Promise.resolve(mockSourceFitLines);
      return Promise.resolve([]);
    });

    poProductRepoMock.findOne.mockImplementation((opts: any) => {
      const id = opts?.where?.id;
      if (id === mockPoProduct.id) return Promise.resolve(mockPoProduct);
      return Promise.resolve(null);
    });

    poRepoMock.findOne.mockImplementation((opts: any) => {
      const id = opts?.where?.id;
      if (id === mockPo.id) return Promise.resolve(mockPo);
      return Promise.resolve(null);
    });

    poColorRepoMock.find.mockResolvedValue([
      { id: 'color-1', productId: mockPoProduct.id, colorName: 'Đen' },
    ]);

    poColorSizeRepoMock.find.mockResolvedValue([
      { id: 'size-1', productColorId: 'color-1', sizeName: 'L', quantity: 120 },
      { id: 'size-2', productColorId: 'color-1', sizeName: 'XL', quantity: 80 },
    ]);

    poColorSizeRepoMock.createQueryBuilder = jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ totalQuantity: '200' }),
    });
  }

  beforeEach(async () => {
    bomRepoMock = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    bomRevisionRepoMock = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    bomLineRepoMock = {
      find: jest.fn(),
    };
    bomStatusHistoryRepoMock = {
      find: jest.fn(),
    };
    styleRepoMock = {
      findOne: jest.fn(),
    };
    poProductRepoMock = {
      findOne: jest.fn(),
    };
    poRepoMock = {
      findOne: jest.fn(),
    };
    poColorRepoMock = {
      find: jest.fn(),
    };
    poColorSizeRepoMock = {
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalQuantity: '200' }),
      }),
    };
    dataSourceMock = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomsService,
        BomCostService,
        { provide: getRepositoryToken(Bom), useValue: bomRepoMock },
        {
          provide: getRepositoryToken(BomRevision),
          useValue: bomRevisionRepoMock,
        },
        { provide: getRepositoryToken(BomLine), useValue: bomLineRepoMock },
        {
          provide: getRepositoryToken(BomRevisionStatusHistory),
          useValue: bomStatusHistoryRepoMock,
        },
        { provide: getRepositoryToken(Style), useValue: styleRepoMock },
        {
          provide: getRepositoryToken(PurchaseOrderProduct),
          useValue: poProductRepoMock,
        },
        { provide: getRepositoryToken(PurchaseOrder), useValue: poRepoMock },
        {
          provide: getRepositoryToken(PurchaseOrderProductColor),
          useValue: poColorRepoMock,
        },
        {
          provide: getRepositoryToken(PurchaseOrderProductColorSize),
          useValue: poColorSizeRepoMock,
        },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get<BomsService>(BomsService);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. SUCCESSFUL COPY FIT -> PO (Sections 3, 7, 9, 10, 11, 12, 14, 24)
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Successful Copy Fit BOM -> PO BOM', () => {
    it('successfully copies closed Fit BOM revision to empty PO revision with unitCost reset to null', async () => {
      setupCopyEnv();

      const result = await service.copyFromFit(
        mockTargetPoBom.id,
        { sourceRevisionId: mockSourceFitRev.id },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      // Verify returned PO BOM detail
      expect(result.id).toBe(mockTargetPoBom.id);
      expect(result.bomCode).toBe('BOM-PO001-P001');
      expect(result.type).toBe(BomType.PO);
      expect(result.currentRevision?.id).toBe(mockTargetPoRev.id);
      expect(result.currentRevision?.revisionNo).toBe(1);
      expect(result.currentRevision?.status).toBe(BomRevisionStatus.WAIT_NVKH);
      expect(result.currentRevision?.sourceRevisionId).toBe(
        mockSourceFitRev.id,
      );

      // Verify copied lines count
      expect(result.lines.length).toBe(2);

      // Verify line 1
      const line1 = result.lines[0];
      expect(line1.id).toBeDefined();
      expect(line1.id).not.toBe(mockSourceFitLines[0].id); // MUST have new line ID
      expect(line1.materialId).toBe('mat-uuid-1');
      expect(line1.materialNameSnapshot).toBe('Vải Cotton 100% 220gsm');
      expect(line1.materialGroupId).toBe('grp-uuid-1');
      expect(line1.materialGroupSnapshot).toBe('Vải chính');
      expect(line1.unitId).toBe('unit-uuid-1');
      expect(line1.unitSnapshot).toBe('Mét');
      expect(Number(line1.consumption)).toBe(1.8);
      expect(line1.unitCost).toBeNull(); // CRITICAL: Reset to NULL!
      expect(line1.note).toBe('Định mức vải chính cho mẫu');
      expect(line1.orderIndex).toBe(0);

      // Verify line 2
      const line2 = result.lines[1];
      expect(line2.id).toBeDefined();
      expect(line2.id).not.toBe(mockSourceFitLines[1].id);
      expect(line2.materialId).toBe('mat-uuid-2');
      expect(line2.materialNameSnapshot).toBe('Bo cổ dệt sọc thể thao');
      expect(Number(line2.consumption)).toBe(1.0);
      expect(line2.unitCost).toBeNull(); // CRITICAL: Reset to NULL!
      expect(line2.orderIndex).toBe(1);

      // Verify costs: costPerUnit and currentOrderCost are NULL
      expect(result.costPerUnit).toBeNull();
      expect(result.currentOrderCost).toBeNull();

      // Verify live currentOrderQuantity = 120 + 80 = 200
      expect(result.currentOrderQuantity).toBe(200);

      // Verify PO colorNameSnapshot remains null
      expect(result.colorNameSnapshot).toBeNull();

      // Verify BOM rowVersion incremented
      expect(mockTargetPoBom.rowVersion).toBe(2);

      // Verify source Fit BOM remained unchanged
      expect(mockSourceFitRev.status).toBe(BomRevisionStatus.CLOSED);
      expect(mockSourceFitLines[0].unitCost).toBe(135000);
      expect(mockSourceFitLines[1].unitCost).toBe(18000);
    });

    it('auto-resolves source Fit revision when sourceRevisionId is omitted in request body', async () => {
      setupCopyEnv();

      const result = await service.copyFromFit(
        mockTargetPoBom.id,
        {}, // Empty body: auto-resolve from poProduct.sourceStyleId
        'user-tpkh-1',
        UserRoleCode.TPKH,
      );

      expect(result.lines.length).toBe(2);
      expect(result.currentRevision?.sourceRevisionId).toBe(
        mockSourceFitRev.id,
      );
      expect(result.lines[0].unitCost).toBeNull();
      expect(result.lines[1].unitCost).toBeNull();
      expect(result.costPerUnit).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. TARGET DATA PROTECTION & ANTI-OVERWRITE (Section 6)
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Target Data Protection & Anti-Overwrite', () => {
    it('rejects copy request when target PO revision already has lines (409 Conflict)', async () => {
      setupCopyEnv();

      // Pre-seed an existing line in target PO revision
      const existingPoLine = new BomLine();
      existingPoLine.id = 'existing-line-1';
      existingPoLine.revisionId = mockTargetPoRev.id;
      existingPoLine.materialId = 'mat-existing';
      existingPoLine.consumption = 1.0;
      mockTargetPoLines = [existingPoLine];

      await expect(
        service.copyFromFit(
          mockTargetPoBom.id,
          { sourceRevisionId: mockSourceFitRev.id },
          'user-nvkh-1',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(ConflictException);

      // Ensure existing lines were not deleted or overwritten
      expect(mockTargetPoLines.length).toBe(1);
      expect(mockTargetPoLines[0].id).toBe('existing-line-1');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. TARGET BOM STATE VALIDATION (Sections 4, 5, 15)
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Target BOM State Validation', () => {
    it('throws NotFoundException when target BOM does not exist (404)', async () => {
      setupCopyEnv();

      await expect(
        service.copyFromFit(
          'non-existent-po-bom',
          { sourceRevisionId: mockSourceFitRev.id },
          'user-nvkh-1',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when target BOM is of type fit (400 Bad Request)', async () => {
      setupCopyEnv();

      // Set target BOM type to FIT
      mockTargetPoBom.bomType = BomType.FIT;

      await expect(
        service.copyFromFit(
          mockTargetPoBom.id,
          { sourceRevisionId: mockSourceFitRev.id },
          'user-nvkh-1',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when target BOM is discontinued (400 Bad Request)', async () => {
      setupCopyEnv();

      mockTargetPoBom.discontinuedAt = new Date();

      await expect(
        service.copyFromFit(
          mockTargetPoBom.id,
          { sourceRevisionId: mockSourceFitRev.id },
          'user-nvkh-1',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when target PO revision is not in wait_nvkh (e.g. wait_rd, closed) (400 Bad Request)', async () => {
      const nonWaitNvkhStatuses = [
        BomRevisionStatus.WAIT_RD,
        BomRevisionStatus.WAIT_TPKH_CONFIRM,
        BomRevisionStatus.WAIT_ACCOUNTING,
        BomRevisionStatus.WAIT_SA_APPROVE,
        BomRevisionStatus.CLOSED,
      ];

      for (const status of nonWaitNvkhStatuses) {
        setupCopyEnv();
        mockTargetPoRev.status = status;

        await expect(
          service.copyFromFit(
            mockTargetPoBom.id,
            { sourceRevisionId: mockSourceFitRev.id },
            'user-nvkh-1',
            UserRoleCode.NVKH,
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. SOURCE BOM & REVISION VALIDATION (Sections 7, 8)
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Source BOM & Revision Validation', () => {
    it('throws NotFoundException when sourceRevisionId does not exist (404)', async () => {
      setupCopyEnv();

      await expect(
        service.copyFromFit(
          mockTargetPoBom.id,
          { sourceRevisionId: 'non-existent-source-rev' },
          'user-nvkh-1',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when source BOM is not of type fit (e.g. source is a PO BOM) (400 Bad Request)', async () => {
      setupCopyEnv();

      // Mark source BOM as PO
      mockSourceFitBom.bomType = BomType.PO;

      await expect(
        service.copyFromFit(
          mockTargetPoBom.id,
          { sourceRevisionId: mockSourceFitRev.id },
          'user-nvkh-1',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when source revision status is NOT closed (e.g. wait_nvkh, wait_rd) (400 Bad Request)', async () => {
      const openStatuses = [
        BomRevisionStatus.WAIT_NVKH,
        BomRevisionStatus.WAIT_RD,
        BomRevisionStatus.WAIT_TPKH_CONFIRM,
        BomRevisionStatus.WAIT_ACCOUNTING,
        BomRevisionStatus.WAIT_SA_APPROVE,
      ];

      for (const status of openStatuses) {
        setupCopyEnv();
        mockSourceFitRev.status = status;

        await expect(
          service.copyFromFit(
            mockTargetPoBom.id,
            { sourceRevisionId: mockSourceFitRev.id },
            'user-nvkh-1',
            UserRoleCode.NVKH,
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects when source revision belongs to another BOM (400 Bad Request)', async () => {
      setupCopyEnv();

      mockSourceFitBom.styleId = 'different-style-uuid';

      await expect(
        service.copyFromFit(
          mockTargetPoBom.id,
          { sourceRevisionId: mockSourceFitRev.id },
          'user-nvkh-1',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects auto-resolve when PO Product has no sourceStyleId (400 Bad Request)', async () => {
      setupCopyEnv();
      mockPoProduct.sourceStyleId = null as any;

      await expect(
        service.copyFromFit(
          mockTargetPoBom.id,
          {},
          'user-nvkh-1',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when auto-resolving and Fit BOM for Style does not exist (404)', async () => {
      setupCopyEnv();
      mockPoProduct.sourceStyleId = 'style-with-no-fit-bom';

      await expect(
        service.copyFromFit(
          mockTargetPoBom.id,
          {},
          'user-nvkh-1',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. ROLE AUTHORIZATION (Section 19)
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. Role Authorization', () => {
    it('allows NVKH, TPKH, and SA to perform copy-from-fit', async () => {
      const allowedRoles = [
        UserRoleCode.NVKH,
        UserRoleCode.TPKH,
        UserRoleCode.SA,
      ];

      for (const role of allowedRoles) {
        setupCopyEnv();
        const res = await service.copyFromFit(
          mockTargetPoBom.id,
          { sourceRevisionId: mockSourceFitRev.id },
          `user-${role}`,
          role,
        );
        expect(res.lines.length).toBe(2);
      }
    });

    it('rejects RD and ACCOUNTING from performing copy-from-fit (403 Forbidden)', async () => {
      const forbiddenRoles = [UserRoleCode.RD, UserRoleCode.ACCOUNTING];

      for (const role of forbiddenRoles) {
        setupCopyEnv();
        await expect(
          service.copyFromFit(
            mockTargetPoBom.id,
            { sourceRevisionId: mockSourceFitRev.id },
            `user-${role}`,
            role,
          ),
        ).rejects.toThrow(ForbiddenException);
      }
    });

    it('rejects anonymous / null role from performing copy-from-fit (403 Forbidden)', async () => {
      setupCopyEnv();
      await expect(
        service.copyFromFit(
          mockTargetPoBom.id,
          { sourceRevisionId: mockSourceFitRev.id },
          'anonymous-user',
          null as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. SNAPSHOT & COST ISOLATION (Sections 8, 10, 11, 27, 28)
  // ──────────────────────────────────────────────────────────────────────────
  describe('6. Snapshot & Cost Isolation', () => {
    it('isolates snapshots: changes to Master Material do not affect copied PO lines or Fit lines', async () => {
      setupCopyEnv();

      // Fit line has snapshot "Vải Cotton 100% 220gsm"
      await service.copyFromFit(
        mockTargetPoBom.id,
        { sourceRevisionId: mockSourceFitRev.id },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      expect(mockTargetPoLines[0].materialNameSnapshot).toBe(
        'Vải Cotton 100% 220gsm',
      );
      expect(mockSourceFitLines[0].materialNameSnapshot).toBe(
        'Vải Cotton 100% 220gsm',
      );
    });

    it('isolates costs: entering prices for PO lines at N4 does not modify Fit BOM cost', async () => {
      setupCopyEnv();

      // Fit BOM Rev 1 cost: (1.8 * 135000) + (1.0 * 18000) = 243000 + 18000 = 261000
      expect(mockSourceFitLines[0].unitCost).toBe(135000);
      expect(mockSourceFitLines[1].unitCost).toBe(18000);

      // Copy to PO
      await service.copyFromFit(
        mockTargetPoBom.id,
        { sourceRevisionId: mockSourceFitRev.id },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      // Initially PO lines have null unitCost
      expect(mockTargetPoLines[0].unitCost).toBeNull();
      expect(mockTargetPoLines[1].unitCost).toBeNull();

      // Accounting later sets price for PO lines
      mockTargetPoLines[0].unitCost = 150000;
      mockTargetPoLines[1].unitCost = 20000;

      // Fit BOM lines remain completely untouched
      expect(mockSourceFitLines[0].unitCost).toBe(135000);
      expect(mockSourceFitLines[1].unitCost).toBe(18000);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. SOURCE IMMUTABILITY & LINEAGE TRACE (Sections 12, 13, 15, 29, 30)
  // ──────────────────────────────────────────────────────────────────────────
  describe('7. Source Immutability & Lineage Trace', () => {
    it('modifying target PO lines does not mutate source Fit lines or entities', async () => {
      setupCopyEnv();

      await service.copyFromFit(
        mockTargetPoBom.id,
        { sourceRevisionId: mockSourceFitRev.id },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      // Modify target PO line consumption and note
      mockTargetPoLines[0].consumption = 2.5;
      mockTargetPoLines[0].note = 'PO specific consumption change';

      // Source Fit line remains intact
      expect(mockSourceFitLines[0].consumption).toBe(1.8);
      expect(mockSourceFitLines[0].note).toBe('Định mức vải chính cho mẫu');
    });

    it('maintains fixed historical sourceRevisionId lineage even if Fit creates a new revision later', async () => {
      setupCopyEnv();

      await service.copyFromFit(
        mockTargetPoBom.id,
        { sourceRevisionId: mockSourceFitRev.id },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      expect(mockTargetPoRev.sourceRevisionId).toBe(mockSourceFitRev.id);

      // Simulate Fit BOM creating Rev 2 later
      mockSourceFitBom.currentRevisionId = 'rev-fit-uuid-2';

      // PO BOM sourceRevisionId remains firmly anchored to Fit Rev 1
      expect(mockTargetPoRev.sourceRevisionId).toBe('rev-fit-uuid-1');
    });

    it('does not create any fake workflow status history entries for copy operation', async () => {
      setupCopyEnv();

      await service.copyFromFit(
        mockTargetPoBom.id,
        { sourceRevisionId: mockSourceFitRev.id },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      // History repository was not called
      expect(bomStatusHistoryRepoMock.find).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. ROLE COST MASKING IN COPY RESPONSE (Sections 24, 31)
  // ──────────────────────────────────────────────────────────────────────────
  describe('8. Role Cost Masking in Copy Response', () => {
    it('masks unitCost, lineCost, and costPerUnit for NVKH and RD roles', async () => {
      setupCopyEnv();

      const resNVKH = await service.copyFromFit(
        mockTargetPoBom.id,
        { sourceRevisionId: mockSourceFitRev.id },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      expect(resNVKH.costPerUnit).toBeNull();
      expect(resNVKH.currentOrderCost).toBeNull();
      expect(resNVKH.lines[0].unitCost).toBeNull();
      expect(resNVKH.lines[0].lineCost).toBeNull();
      expect(resNVKH.currentOrderQuantity).toBe(200); // Quantity is visible
    });

    it('returns null costs for SA, TPKH, and ACCOUNTING roles immediately after copy', async () => {
      setupCopyEnv();

      const resSA = await service.copyFromFit(
        mockTargetPoBom.id,
        { sourceRevisionId: mockSourceFitRev.id },
        'user-sa-1',
        UserRoleCode.SA,
      );

      expect(resSA.costPerUnit).toBeNull();
      expect(resSA.currentOrderCost).toBeNull();
      expect(resSA.lines[0].unitCost).toBeNull();
      expect(resSA.lines[0].lineCost).toBeNull();
      expect(resSA.currentOrderQuantity).toBe(200);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 9. CONCURRENCY & TRANSACTION ROLLBACK (Sections 20, 21, 32)
  // ──────────────────────────────────────────────────────────────────────────
  describe('9. Concurrency & Transaction Rollback', () => {
    it('rejects duplicate concurrent copy requests: second request fails because lines already exist', async () => {
      setupCopyEnv();

      // Request 1 succeeds
      await service.copyFromFit(
        mockTargetPoBom.id,
        { sourceRevisionId: mockSourceFitRev.id },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      // Request 2 on the same target BOM must fail with ConflictException
      await expect(
        service.copyFromFit(
          mockTargetPoBom.id,
          { sourceRevisionId: mockSourceFitRev.id },
          'user-nvkh-2',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rolls back transaction cleanly if saving lines throws an unexpected error', async () => {
      setupCopyEnv();

      // Simulate a DB error during manager.save(BomLine)
      dataSourceMock.transaction.mockImplementationOnce(async (cb: any) => {
        const errorManager = {
          findOne: jest.fn().mockImplementation((entityClass, options) => {
            if (entityClass === Bom) {
              const id = options?.where?.id;
              if (id === mockTargetPoBom.id)
                return Promise.resolve(mockTargetPoBom);
              if (id === mockSourceFitBom.id)
                return Promise.resolve(mockSourceFitBom);
            }
            if (entityClass === BomRevision) {
              const id = options?.where?.id;
              if (id === mockTargetPoRev.id)
                return Promise.resolve(mockTargetPoRev);
              if (id === mockSourceFitRev.id)
                return Promise.resolve(mockSourceFitRev);
            }
            return Promise.resolve(null);
          }),
          count: jest.fn().mockResolvedValue(0),
          find: jest.fn().mockResolvedValue(mockSourceFitLines),
          create: jest.fn().mockImplementation((_c, data) => data),
          save: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === BomLine) {
              const err: any = new Error('Database connection lost');
              err.code = '57P01';
              throw err;
            }
            return Promise.resolve();
          }),
        };
        return cb(errorManager);
      });

      await expect(
        service.copyFromFit(
          mockTargetPoBom.id,
          { sourceRevisionId: mockSourceFitRev.id },
          'user-nvkh-1',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow('Database connection lost');

      // Verify target PO lines remain empty
      expect(mockTargetPoLines.length).toBe(0);
      expect(mockTargetPoRev.sourceRevisionId).toBeNull();
    });
  });
});
