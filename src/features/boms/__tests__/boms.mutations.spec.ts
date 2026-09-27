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
import { BomCostService } from '../bom-cost.service';
import { Bom } from '../entities/Bom.entity';
import { BomRevision } from '../entities/BomRevision.entity';
import { BomLine } from '../entities/BomLine.entity';
import { BomRevisionStatusHistory } from '../entities/BomRevisionStatusHistory.entity';
import { Style } from '../../styles/entities/Style.entity';
import { PurchaseOrderProduct } from '../../purchase-orders/entities/PurchaseOrderProduct.entity';
import { PurchaseOrder } from '../../purchase-orders/entities/PurchaseOrder.entity';
import { PurchaseOrderProductColor } from '../../purchase-orders/entities/PurchaseOrderProductColor.entity';
import { PurchaseOrderProductColorSize } from '../../purchase-orders/entities/PurchaseOrderProductColorSize.entity';
import {
  BomRevisionStatus,
  BomType,
} from '../../../common/enums/database.enums';
import { UserRoleCode } from '../../user-management/dto/query-users.dto';

describe('BOM Mutations: Create, Update Header, Discontinue (PR-02 Specification)', () => {
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

  const discontinueWithVersion = (
    id: string,
    dto: any,
    userId: string,
    roleCode: string,
  ) =>
    service.discontinue(
      id,
      { ...dto, expectedRowVersion: dto.expectedRowVersion ?? 1 } as any,
      userId,
      roleCode,
    );

  beforeEach(async () => {
    bomRepoMock = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };
    bomRevisionRepoMock = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };
    bomLineRepoMock = {
      find: jest.fn().mockResolvedValue([]),
    };
    bomStatusHistoryRepoMock = {
      find: jest.fn().mockResolvedValue([]),
    };
    styleRepoMock = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    poProductRepoMock = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    poRepoMock = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    poColorRepoMock = {
      find: jest.fn().mockResolvedValue([]),
    };
    poColorSizeRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalQuantity: 0 }),
      }),
    };

    dataSourceMock = {
      transaction: jest.fn().mockImplementation(async (cb: any) =>
        cb({
          findOne: jest.fn().mockImplementation((entityClass, options) => {
            if (entityClass === Bom) {
              return bomRepoMock.findOne(options);
            }
            if (entityClass === BomRevision) {
              return bomRevisionRepoMock.findOne(options);
            }
            return Promise.resolve(null);
          }),
          save: jest
            .fn()
            .mockImplementation((entityClass, data) =>
              entityClass === BomRevision
                ? bomRevisionRepoMock.save(data)
                : bomRepoMock.save(data),
            ),
        }),
      ),
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
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: poRepoMock,
        },
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
  // A. CREATE FIT BOM
  // ──────────────────────────────────────────────────────────────────────────
  describe('A. Create FIT BOM', () => {
    it('1-6. successfully creates Fit BOM with BOM-FIT-{styleCode}, revision 1 wait_nvkh, linked currentRevisionId, and null PO owner', async () => {
      const styleId = 'style-uuid-1';
      const mockStyle = new Style();
      mockStyle.id = styleId;
      mockStyle.styleCode = 'ST7918';
      mockStyle.styleName = 'Slim Fit Jacket';

      const savedBom = new Bom();
      savedBom.id = 'bom-fit-created-id';
      savedBom.bomCode = 'BOM-FIT-ST7918';
      savedBom.bomType = BomType.FIT;
      savedBom.styleId = styleId;
      savedBom.purchaseOrderProductId = null;
      savedBom.currentRevisionId = 'rev-1-id';
      savedBom.createdAt = new Date();
      savedBom.updatedAt = new Date();

      const savedRev = new BomRevision();
      savedRev.id = 'rev-1-id';
      savedRev.bomId = savedBom.id;
      savedRev.revisionNo = 1;
      savedRev.status = BomRevisionStatus.WAIT_NVKH;
      savedRev.createdAt = new Date();

      // Mock transaction execution
      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Style) return Promise.resolve(mockStyle);
            if (entityClass === Bom) return Promise.resolve(null); // No collision, no duplicate
            return Promise.resolve(null);
          }),
          create: jest.fn().mockImplementation((entityClass, data) => {
            if (entityClass === Bom) {
              return Object.assign(new Bom(), data, { id: savedBom.id });
            }
            if (entityClass === BomRevision) {
              return Object.assign(new BomRevision(), data, {
                id: savedRev.id,
              });
            }
            return data;
          }),
          save: jest.fn().mockImplementation((entityClass, data) => {
            return Promise.resolve(data);
          }),
        };
        return cb(managerMock);
      });

      // Mock findOne on service for return
      bomRepoMock.findOne.mockResolvedValue(savedBom);
      bomRevisionRepoMock.findOne.mockResolvedValue(savedRev);
      styleRepoMock.findOne.mockResolvedValue(mockStyle);

      const result = await service.create(
        { type: BomType.FIT, styleId },
        'nvkh-user-id',
        'NVKH',
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(savedBom.id);
      expect(result.bomCode).toBe('BOM-FIT-ST7918'); // 2. đúng bom_code
      expect(result.type).toBe(BomType.FIT);
      expect(result.currentRevision?.revisionNo).toBe(1); // 3. tạo revision 1
      expect(result.currentRevision?.status).toBe(BomRevisionStatus.WAIT_NVKH); // 4. revision status wait_nvkh
      expect(result.purchaseOrderProduct).toBeNull(); // 6. không có PO owner
      expect(result.style?.styleCode).toBe('ST7918');
    });

    it('7. rejects duplicate Fit BOM when Style already has a Fit BOM (ConflictException)', async () => {
      const styleId = 'style-uuid-dup';
      const mockStyle = new Style();
      mockStyle.id = styleId;
      mockStyle.styleCode = 'ST-DUP';

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Style) return Promise.resolve(mockStyle);
            if (entityClass === Bom) {
              // Existing BOM found!
              return Promise.resolve(new Bom());
            }
            return Promise.resolve(null);
          }),
        };
        return cb(managerMock);
      });

      await expect(
        service.create({ type: BomType.FIT, styleId }, 'user-id', 'TPKH'),
      ).rejects.toThrow(ConflictException);
    });

    it('8. rejects Fit BOM creation when Style does not exist (NotFoundException)', async () => {
      const styleId = 'non-existent-style';

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockResolvedValue(null),
        };
        return cb(managerMock);
      });

      await expect(
        service.create({ type: BomType.FIT, styleId }, 'user-id', 'SA'),
      ).rejects.toThrow(NotFoundException);
    });

    it('9. rejects Fit BOM creation when styleId is missing', async () => {
      await expect(
        service.create({ type: BomType.FIT } as any, 'user-id', 'NVKH'),
      ).rejects.toThrow(BadRequestException);
    });

    it('10. rejects Fit BOM creation when purchaseOrderProductId is sent', async () => {
      await expect(
        service.create(
          {
            type: BomType.FIT,
            styleId: 'style-1',
            purchaseOrderProductId: 'pop-1',
          },
          'user-id',
          'NVKH',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // B. CREATE PO BOM
  // ──────────────────────────────────────────────────────────────────────────
  describe('B. Create PO BOM', () => {
    it('11-18. successfully creates PO BOM with BOM-{poCode}-{productCode}, revision 1 wait_nvkh, styleId=null, and color_name_snapshot=null', async () => {
      const popId = 'pop-uuid-1';
      const mockPop = new PurchaseOrderProduct();
      mockPop.id = popId;
      mockPop.purchaseOrderId = 'po-uuid-1';
      mockPop.productCode = '7918B293MB';
      mockPop.productName = 'Men Casual Jacket';

      const mockPo = new PurchaseOrder();
      mockPo.id = 'po-uuid-1';
      mockPo.poCode = 'SP26-41075';
      mockPo.customerNameSnapshot = 'Brand Client';

      const savedBom = new Bom();
      savedBom.id = 'bom-po-created-id';
      savedBom.bomCode = 'BOM-SP26-41075-7918B293MB';
      savedBom.bomType = BomType.PO;
      savedBom.purchaseOrderProductId = popId;
      savedBom.styleId = null;
      savedBom.colorNameSnapshot = null; // 18. color_name_snapshot = null
      savedBom.currentRevisionId = 'rev-po-1';
      savedBom.createdAt = new Date();
      savedBom.updatedAt = new Date();

      const savedRev = new BomRevision();
      savedRev.id = 'rev-po-1';
      savedRev.bomId = savedBom.id;
      savedRev.revisionNo = 1;
      savedRev.status = BomRevisionStatus.WAIT_NVKH;
      savedRev.createdAt = new Date();

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === PurchaseOrderProduct)
              return Promise.resolve(mockPop);
            if (entityClass === PurchaseOrder) return Promise.resolve(mockPo);
            if (entityClass === Bom) return Promise.resolve(null);
            return Promise.resolve(null);
          }),
          create: jest.fn().mockImplementation((entityClass, data) => {
            if (entityClass === Bom) {
              return Object.assign(new Bom(), data, { id: savedBom.id });
            }
            if (entityClass === BomRevision) {
              return Object.assign(new BomRevision(), data, {
                id: savedRev.id,
              });
            }
            return data;
          }),
          save: jest
            .fn()
            .mockImplementation((entityClass, data) => Promise.resolve(data)),
        };
        return cb(managerMock);
      });

      bomRepoMock.findOne.mockResolvedValue(savedBom);
      bomRevisionRepoMock.findOne.mockResolvedValue(savedRev);
      poProductRepoMock.findOne.mockResolvedValue(mockPop);
      poRepoMock.findOne.mockResolvedValue(mockPo);

      const result = await service.create(
        { type: BomType.PO, purchaseOrderProductId: popId },
        'nvkh-user-id',
        'TPKH',
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(savedBom.id);
      expect(result.bomCode).toBe('BOM-SP26-41075-7918B293MB'); // 12. đúng bom_code
      expect(result.type).toBe(BomType.PO);
      expect(result.style).toBeNull(); // 17. style_id = null
      expect(result.colorNameSnapshot).toBeNull(); // 18. color_name_snapshot = null
      expect(result.currentRevision?.revisionNo).toBe(1);
      expect(result.currentRevision?.status).toBe(BomRevisionStatus.WAIT_NVKH);
      expect(result.purchaseOrderProduct?.productCode).toBe('7918B293MB');
      expect(result.purchaseOrderProduct?.purchaseOrder?.poCode).toBe(
        'SP26-41075',
      );
    });

    it('19. rejects duplicate PO BOM when PO product already has a PO BOM (ConflictException)', async () => {
      const popId = 'pop-uuid-dup';
      const mockPop = new PurchaseOrderProduct();
      mockPop.id = popId;
      mockPop.purchaseOrderId = 'po-1';

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === PurchaseOrderProduct)
              return Promise.resolve(mockPop);
            if (entityClass === PurchaseOrder)
              return Promise.resolve(new PurchaseOrder());
            if (entityClass === Bom) return Promise.resolve(new Bom()); // Conflict!
            return Promise.resolve(null);
          }),
        };
        return cb(managerMock);
      });

      await expect(
        service.create(
          { type: BomType.PO, purchaseOrderProductId: popId },
          'user-id',
          'TPKH',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('20. rejects PO BOM creation when PurchaseOrderProduct does not exist (NotFoundException)', async () => {
      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockResolvedValue(null),
        };
        return cb(managerMock);
      });

      await expect(
        service.create(
          { type: BomType.PO, purchaseOrderProductId: 'invalid-pop' },
          'user-id',
          'SA',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('21. rejects PO BOM creation when purchaseOrderProductId is missing', async () => {
      await expect(
        service.create({ type: BomType.PO } as any, 'user-id', 'NVKH'),
      ).rejects.toThrow(BadRequestException);
    });

    it('22. rejects PO BOM creation when styleId is sent', async () => {
      await expect(
        service.create(
          {
            type: BomType.PO,
            purchaseOrderProductId: 'pop-1',
            styleId: 'style-1',
          },
          'user-id',
          'NVKH',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // C. OWNER ISOLATION & PRODUCT COLOR REJECTION
  // ──────────────────────────────────────────────────────────────────────────
  describe('C. Owner Isolation & Color Protection', () => {
    it('23-25. rejects request attempting to specify productColorId for BOM creation', async () => {
      await expect(
        service.create(
          {
            type: BomType.PO,
            purchaseOrderProductId: 'pop-1',
            productColorId: 'color-specific-id',
          } as any,
          'user-id',
          'NVKH',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('disallows unauthorized roles from creating BOM (e.g. RD, ACCOUNTING, IT)', async () => {
      await expect(
        service.create(
          { type: BomType.FIT, styleId: 'style-1' },
          'user-id',
          'RD',
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.create(
          { type: BomType.FIT, styleId: 'style-1' },
          'user-id',
          'ACCOUNTING',
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.create(
          { type: BomType.FIT, styleId: 'style-1' },
          'user-id',
          'IT',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // D. PATCH HEADER (deadline, rdNote)
  // ──────────────────────────────────────────────────────────────────────────
  describe('D. Update BOM Header (PATCH /:id)', () => {
    /**
     * Helper: set up dataSourceMock.transaction so it resolves with the given
     * bom and optional revision inside the manager mock, mirroring how the
     * update() method now runs entirely within a transaction.
     */
    function setupHeaderTxMock(bom: Bom, rev: BomRevision | null = null) {
      bomRepoMock.findOne.mockResolvedValue(bom);
      if (rev) {
        bomRevisionRepoMock.findOne.mockResolvedValue(rev);
      }
      const saveMock = jest
        .fn()
        .mockImplementation((_: any, entity: any) => Promise.resolve(entity));
      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const mgr = {
          findOne: jest.fn().mockImplementation((entityClass: any) => {
            if (entityClass === Bom) return Promise.resolve(bom);
            if (entityClass === BomRevision) return Promise.resolve(rev);
            return Promise.resolve(null);
          }),
          save: saveMock,
        };
        return cb(mgr);
      });
      return saveMock;
    }

    it('26. updates deadline successfully when authorized (NVKH, TPKH, SA)', async () => {
      const bom = new Bom();
      bom.id = 'bom-to-update';
      bom.bomCode = 'BOM-ORIGINAL';
      bom.bomType = BomType.FIT;
      bom.discontinuedAt = null;
      bom.deadline = null;
      bom.rowVersion = 1;

      const saveMock = setupHeaderTxMock(bom, null);

      const targetDeadline = '2026-11-01T00:00:00.000Z';
      await service.update(
        'bom-to-update',
        { deadline: targetDeadline },
        'user-1',
        'NVKH',
      );

      expect(saveMock).toHaveBeenCalledWith(
        Bom,
        expect.objectContaining({
          id: 'bom-to-update',
          deadline: new Date(targetDeadline),
          bomCode: 'BOM-ORIGINAL',
          bomType: BomType.FIT,
          rowVersion: 2,
        }),
      );
    });

    it('27. updates rdNote successfully when authorized (RD, TPKH, SA)', async () => {
      const bom = new Bom();
      bom.id = 'bom-rd-update';
      bom.discontinuedAt = null;
      bom.rdNote = null;
      bom.rowVersion = 1;

      const saveMock = setupHeaderTxMock(bom, null);

      await service.update(
        'bom-rd-update',
        { rdNote: 'New RD Note' },
        'rd-user',
        'RD',
      );

      expect(saveMock).toHaveBeenCalledWith(
        Bom,
        expect.objectContaining({
          rdNote: 'New RD Note',
          rowVersion: 2,
        }),
      );
    });

    it('28. rejects NVKH updating rdNote (ForbiddenException)', async () => {
      const bom = new Bom();
      bom.id = 'bom-1';
      bom.discontinuedAt = null;

      setupHeaderTxMock(bom, null);

      await expect(
        service.update(
          'bom-1',
          { rdNote: 'Unauthorized change' },
          'nvkh-user',
          'NVKH',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('29. rejects RD updating deadline (ForbiddenException)', async () => {
      const bom = new Bom();
      bom.id = 'bom-1';
      bom.discontinuedAt = null;

      setupHeaderTxMock(bom, null);

      await expect(
        service.update(
          'bom-1',
          { deadline: '2026-11-01T00:00:00.000Z' },
          'rd-user',
          'RD',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('35. rejects header update on a discontinued BOM (BadRequestException)', async () => {
      const bom = new Bom();
      bom.id = 'bom-discontinued';
      bom.discontinuedAt = new Date();

      setupHeaderTxMock(bom, null);

      await expect(
        service.update(
          'bom-discontinued',
          { rdNote: 'Test' },
          'user-id',
          'TPKH',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('36. rejects header update when BOM does not exist (NotFoundException)', async () => {
      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const mgr = {
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
        };
        return cb(mgr);
      });

      await expect(
        service.update(
          'non-existent-bom',
          { rdNote: 'Test' },
          'user-id',
          'TPKH',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('45-47. rejects line mutation on a CLOSED revision with BadRequestException (not ForbiddenException)', async () => {
      const mockBom = new Bom();
      mockBom.id = 'bom-closed';
      const mockRev = new BomRevision();
      mockRev.id = 'rev-closed';
      mockRev.status = BomRevisionStatus.CLOSED;

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const mgr = {
          findOne: jest.fn().mockImplementation((entityClass: any) => {
            if (entityClass === Bom) return Promise.resolve(mockBom);
            if (entityClass === BomRevision) return Promise.resolve(mockRev);
            return Promise.resolve(null);
          }),
          save: jest.fn(),
        };
        return cb(mgr);
      });

      // Any role trying to mutate a CLOSED revision gets BadRequestException
      // from assertRevisionNotClosed (not ForbiddenException).
      await expect(
        service.updateLine(
          mockBom.id,
          'line-xyz',
          { consumption: 2.0 },
          'user-nvkh',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // E. DISCONTINUE BOM (POST /:id/discontinue)
  // ──────────────────────────────────────────────────────────────────────────
  describe('E. Discontinue BOM (POST /:id/discontinue)', () => {
    function setupDiscontinueMocks(
      discontinuedAt: Date | null = null,
      bomId = 'bom-active',
    ) {
      const bom = new Bom();
      bom.id = bomId;
      bom.currentRevisionId = 'rev-active';
      bom.discontinuedAt = discontinuedAt;
      bom.discontinuedReason = null;
      bom.rowVersion = 1;

      const revision = new BomRevision();
      revision.id = 'rev-active';
      revision.bomId = bom.id;
      revision.rowVersion = 1;
      revision.status = BomRevisionStatus.CLOSED;

      bomRepoMock.findOne.mockResolvedValue(bom);
      bomRevisionRepoMock.findOne.mockResolvedValue(revision);
      return { bom, revision };
    }

    it('37-40. discontinues BOM successfully for TPKH and SA, sets discontinuedAt, discontinuedBy, and reason', async () => {
      setupDiscontinueMocks();

      await discontinueWithVersion(
        'bom-active',
        { reason: 'Customer canceled the whole order' },
        'tpkh-id',
        'TPKH',
      );

      expect(bomRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'bom-active',
          discontinuedAt: expect.any(Date),
          discontinuedBy: 'tpkh-id',
          discontinuedReason: 'Customer canceled the whole order',
          rowVersion: 2,
        }),
      );
    });

    it('locks the BOM row before discontinuing to protect currentRevisionId from concurrent revision creation', async () => {
      const { bom, revision } = setupDiscontinueMocks();

      const managerFindOne = jest
        .fn()
        .mockImplementation((entityClass) =>
          entityClass === Bom
            ? Promise.resolve(bom)
            : Promise.resolve(revision),
        );
      const managerSave = jest.fn().mockResolvedValue(bom);
      dataSourceMock.transaction.mockImplementation(async (cb: any) =>
        cb({ findOne: managerFindOne, save: managerSave }),
      );

      await discontinueWithVersion(
        'bom-active',
        { reason: 'Concurrency guard' },
        'sa-id',
        'SA',
      );

      expect(managerFindOne).toHaveBeenCalledWith(
        Bom,
        expect.objectContaining({
          where: { id: 'bom-active' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
      expect(managerSave).toHaveBeenCalledWith(Bom, bom);
    });

    it('41-42. rejects discontinue request with empty or whitespace-only reason (BadRequestException)', async () => {
      setupDiscontinueMocks();

      await expect(
        discontinueWithVersion('bom-active', { reason: '' }, 'tpkh-id', 'TPKH'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        discontinueWithVersion(
          'bom-active',
          { reason: '     ' },
          'tpkh-id',
          'TPKH',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('43. rejects unauthorized roles attempting to discontinue BOM (e.g. NVKH, RD, ACCOUNTING)', async () => {
      setupDiscontinueMocks();

      await expect(
        discontinueWithVersion(
          'bom-active',
          { reason: 'Test' },
          'user-id',
          'NVKH',
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        discontinueWithVersion(
          'bom-active',
          { reason: 'Test' },
          'user-id',
          'RD',
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        discontinueWithVersion(
          'bom-active',
          { reason: 'Test' },
          'user-id',
          'ACCOUNTING',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('44. rejects discontinue on an already discontinued BOM (BadRequestException)', async () => {
      setupDiscontinueMocks(new Date(), 'bom-already-discontinued');

      await expect(
        discontinueWithVersion(
          'bom-already-discontinued',
          { reason: 'Discontinue again' },
          'sa-id',
          'SA',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // F. TRANSACTION SAFETY & DATABASE CONCURRENCY CONSTRAINTS
  // ──────────────────────────────────────────────────────────────────────────
  describe('F. Transaction Safety & Concurrency Guard', () => {
    it('48. rolls back transaction completely if an error occurs during revision creation', async () => {
      const mockStyle = new Style();
      mockStyle.id = 'style-1';
      mockStyle.styleCode = 'ST-ROLLBACK';

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Style) return Promise.resolve(mockStyle);
            return Promise.resolve(null);
          }),
          create: jest.fn().mockImplementation((entityClass, data) => data),
          save: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === BomRevision) {
              throw new Error('Database disk error or deadlock');
            }
            return Promise.resolve({ id: 'bom-saved-temp' });
          }),
        };
        return cb(managerMock);
      });

      await expect(
        service.create(
          { type: BomType.FIT, styleId: 'style-1' },
          'user-id',
          'SA',
        ),
      ).rejects.toThrow('Database disk error or deadlock');
    });

    it('49. catches PostgreSQL 23505 unique constraint error and maps to ConflictException', async () => {
      const mockStyle = new Style();
      mockStyle.id = 'style-1';
      mockStyle.styleCode = 'ST-CONFLICT';

      dataSourceMock.transaction.mockImplementation(async (cb: any) => {
        const managerMock = {
          findOne: jest.fn().mockImplementation((entityClass) => {
            if (entityClass === Style) return Promise.resolve(mockStyle);
            return Promise.resolve(null);
          }),
          create: jest.fn().mockImplementation((entityClass, data) => data),
          save: jest.fn().mockImplementation(() => {
            const pgError: any = new Error(
              'duplicate key value violates unique constraint',
            );
            pgError.code = '23505';
            pgError.constraint = 'uq_boms_fit_style';
            throw pgError;
          }),
        };
        return cb(managerMock);
      });

      await expect(
        service.create(
          { type: BomType.FIT, styleId: 'style-1' },
          'user-id',
          'SA',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });
});
