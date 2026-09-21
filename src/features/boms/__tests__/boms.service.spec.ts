import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
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

describe('BomsService (Read Model & Anti N+1 Tests)', () => {
  let service: BomsService;
  let bomCostService: BomCostService;

  let bomRepoMock: any;
  let bomRevisionRepoMock: any;
  let bomLineRepoMock: any;
  let bomStatusHistoryRepoMock: any;
  let styleRepoMock: any;
  let poProductRepoMock: any;
  let poRepoMock: any;
  let poColorRepoMock: any;
  let poColorSizeRepoMock: any;

  beforeEach(async () => {
    bomRepoMock = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };
    bomRevisionRepoMock = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    bomLineRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(),
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
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue(null),
      }),
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomsService,
        BomCostService,
        {
          provide: getRepositoryToken(Bom),
          useValue: bomRepoMock,
        },
        {
          provide: getRepositoryToken(BomRevision),
          useValue: bomRevisionRepoMock,
        },
        {
          provide: getRepositoryToken(BomLine),
          useValue: bomLineRepoMock,
        },
        {
          provide: getRepositoryToken(BomRevisionStatusHistory),
          useValue: bomStatusHistoryRepoMock,
        },
        {
          provide: getRepositoryToken(Style),
          useValue: styleRepoMock,
        },
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
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BomsService>(BomsService);
    bomCostService = module.get<BomCostService>(BomCostService);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. GET BOM LIST (findAll) & ANTI N+1
  // ──────────────────────────────────────────────────────────────────────────
  describe('findAll (BOM List & Anti N+1)', () => {
    it('returns paginated BOM list, preserves legacy color snapshot, and enriches data in bulk', async () => {
      const mockBomPo = new Bom();
      mockBomPo.id = 'bom-po-1';
      mockBomPo.bomCode = 'BOM-PO-001';
      mockBomPo.bomType = BomType.PO;
      mockBomPo.purchaseOrderProductId = 'pop-1';
      mockBomPo.currentRevisionId = 'rev-1';
      mockBomPo.colorNameSnapshot = 'Legacy Blue'; // 9. Legacy color_name_snapshot preserved
      mockBomPo.createdAt = new Date('2026-09-01');
      mockBomPo.updatedAt = new Date('2026-09-01');

      const mockBomFit = new Bom();
      mockBomFit.id = 'bom-fit-1';
      mockBomFit.bomCode = 'BOM-FIT-001';
      mockBomFit.bomType = BomType.FIT;
      mockBomFit.styleId = 'style-1';
      mockBomFit.currentRevisionId = 'rev-2';
      mockBomFit.createdAt = new Date('2026-09-02');
      mockBomFit.updatedAt = new Date('2026-09-02');

      const qbMock = {
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([[mockBomPo, mockBomFit], 2]),
      };
      bomRepoMock.createQueryBuilder.mockReturnValue(qbMock);

      // Mock bulk fetches
      jest.spyOn(bomCostService, 'calculateCostPerUnits').mockResolvedValue(
        new Map([
          ['rev-1', 45],
          ['rev-2', 30],
        ]),
      );
      jest
        .spyOn(bomCostService, 'calculateCurrentOrderQuantities')
        .mockResolvedValue(new Map([['pop-1', 500]]));

      poColorRepoMock.find.mockResolvedValue([
        { id: 'c-1', productId: 'pop-1', colorName: 'Red', orderIndex: 0 },
        { id: 'c-2', productId: 'pop-1', colorName: 'White', orderIndex: 1 },
      ]);

      styleRepoMock.find.mockResolvedValue([
        { id: 'style-1', styleCode: 'ST-01', styleName: 'Fit Shirt' },
      ]);

      poProductRepoMock.find.mockResolvedValue([
        {
          id: 'pop-1',
          purchaseOrderId: 'po-1',
          productCode: 'PRD-01',
          productName: 'PO T-Shirt',
        },
      ]);

      poRepoMock.find.mockResolvedValue([
        {
          id: 'po-1',
          poCode: 'PO-2026-001',
          customerNameSnapshot: 'Customer A',
        },
      ]);

      bomRevisionRepoMock.find.mockResolvedValue([
        {
          id: 'rev-1',
          revisionNo: 1,
          status: BomRevisionStatus.WAIT_ACCOUNTING,
        },
        { id: 'rev-2', revisionNo: 2, status: BomRevisionStatus.CLOSED },
      ]);

      // Call as SA (authorized role)
      const result = await service.findAll({}, 'SA');

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);

      // Verify PO BOM Item
      const poItem = result.data.find((b) => b.id === 'bom-po-1');
      expect(poItem).toBeDefined();
      expect(poItem?.colorNameSnapshot).toBe('Legacy Blue'); // Legacy preserved
      expect(poItem?.product?.colors).toEqual(['Red', 'White']); // Live colors from PO
      expect(poItem?.currentOrderQuantity).toBe(500); // Live quantity from PO
      expect(poItem?.costPerUnit).toBe(45); // Cost calculated
      expect(poItem?.currentOrderCost).toBe(22500); // 45 * 500

      // Verify Fit BOM Item
      const fitItem = result.data.find((b) => b.id === 'bom-fit-1');
      expect(fitItem).toBeDefined();
      expect(fitItem?.costPerUnit).toBe(30);
      expect(fitItem?.currentOrderQuantity).toBeNull(); // Fit has no quantity
      expect(fitItem?.currentOrderCost).toBeNull(); // Fit has no order cost
      expect(fitItem?.style?.styleCode).toBe('ST-01');

      // Verify anti N+1: calculateCostPerUnits was called exactly ONCE for all revisions
      expect(bomCostService.calculateCostPerUnits).toHaveBeenCalledTimes(1);
      expect(bomCostService.calculateCostPerUnits).toHaveBeenCalledWith([
        'rev-1',
        'rev-2',
      ]);
    });

    it('masks cost fields to null for NVKH and RD roles in list endpoint', async () => {
      const mockBomPo = new Bom();
      mockBomPo.id = 'bom-po-1';
      mockBomPo.bomType = BomType.PO;
      mockBomPo.purchaseOrderProductId = 'pop-1';
      mockBomPo.currentRevisionId = 'rev-1';

      const qbMock = {
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockBomPo], 1]),
      };
      bomRepoMock.createQueryBuilder.mockReturnValue(qbMock);

      const calculateCostPerUnitsSpy = jest.spyOn(
        bomCostService,
        'calculateCostPerUnits',
      );

      // Call as NVKH
      const resultNvkh = await service.findAll({}, 'NVKH');
      expect(resultNvkh.data[0].costPerUnit).toBeNull();
      expect(resultNvkh.data[0].currentOrderCost).toBeNull();
      // Should not even call calculateCostPerUnits
      expect(calculateCostPerUnitsSpy).not.toHaveBeenCalled();

      // Call as RD
      const resultRd = await service.findAll({}, 'RD');
      expect(resultRd.data[0].costPerUnit).toBeNull();
      expect(resultRd.data[0].currentOrderCost).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. GET BOM DETAIL (findOne)
  // ──────────────────────────────────────────────────────────────────────────
  describe('findOne (BOM Detail & Live PO Integration)', () => {
    it('7. loads Fit BOM detail with lines ordered by orderIndex and style relation', async () => {
      const fitBom = new Bom();
      fitBom.id = 'fit-uuid';
      fitBom.bomCode = 'BOM-FIT-100';
      fitBom.bomType = BomType.FIT;
      fitBom.styleId = 'style-100';
      fitBom.currentRevisionId = 'rev-fit-1';
      fitBom.rowVersion = 1;

      const style = new Style();
      style.id = 'style-100';
      style.styleCode = 'ST-POLO';
      style.styleName = 'Polo Shirt';

      const rev = new BomRevision();
      rev.id = 'rev-fit-1';
      rev.revisionNo = 1;
      rev.status = BomRevisionStatus.WAIT_ACCOUNTING;

      const line1 = new BomLine();
      line1.id = 'l-1';
      line1.orderIndex = 1;
      line1.materialNameSnapshot = 'Button';
      line1.consumption = 5;
      line1.unitCost = 2; // 10

      const line2 = new BomLine();
      line2.id = 'l-2';
      line2.orderIndex = 0;
      line2.materialNameSnapshot = 'Polo Fabric';
      line2.consumption = 1.2;
      line2.unitCost = 100; // 120

      bomRepoMock.findOne.mockResolvedValue(fitBom);
      styleRepoMock.findOne.mockResolvedValue(style);
      bomRevisionRepoMock.findOne.mockResolvedValue(rev);
      // Repository returns lines ordered by orderIndex
      bomLineRepoMock.find.mockResolvedValue([line2, line1]);

      const result = await service.findOne('fit-uuid', 'TPKH');

      expect(result.id).toBe('fit-uuid');
      expect(result.type).toBe(BomType.FIT);
      expect(result.style?.styleCode).toBe('ST-POLO');
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0].orderIndex).toBe(0);
      expect(result.lines[1].orderIndex).toBe(1);
      expect(result.lines[0].materialNameSnapshot).toBe('Polo Fabric');
      expect(result.costPerUnit).toBe(130); // 120 + 10
      expect(result.currentOrderQuantity).toBeNull();
      expect(result.currentOrderCost).toBeNull();
    });

    it('8. loads PO BOM detail with live colors, sizes, dynamic quantity, and live cost calculation', async () => {
      const poBom = new Bom();
      poBom.id = 'po-uuid';
      poBom.bomCode = 'BOM-PO-999';
      poBom.bomType = BomType.PO;
      poBom.purchaseOrderProductId = 'pop-999';
      poBom.currentRevisionId = 'rev-po-1';
      poBom.rowVersion = 1;

      const pop = new PurchaseOrderProduct();
      pop.id = 'pop-999';
      pop.purchaseOrderId = 'po-999';
      pop.productCode = 'PROD-POLO';
      pop.productName = 'Men Polo';

      const po = new PurchaseOrder();
      po.id = 'po-999';
      po.poCode = 'PO-999';
      po.customerNameSnapshot = 'Global Brand';

      const rev = new BomRevision();
      rev.id = 'rev-po-1';
      rev.revisionNo = 1;
      rev.status = BomRevisionStatus.WAIT_SA_APPROVE;

      const line = new BomLine();
      line.id = 'line-1';
      line.materialNameSnapshot = 'Cotton 100%';
      line.consumption = 2;
      line.unitCost = 25; // costPerUnit = 50

      bomRepoMock.findOne.mockResolvedValue(poBom);
      poProductRepoMock.findOne.mockResolvedValue(pop);
      poRepoMock.findOne.mockResolvedValue(po);
      bomRevisionRepoMock.findOne.mockResolvedValue(rev);
      bomLineRepoMock.find.mockResolvedValue([line]);

      // Mock live colors and sizes
      poColorRepoMock.find.mockResolvedValue([
        { id: 'c-red', productId: 'pop-999', colorName: 'Red', orderIndex: 0 },
        {
          id: 'c-blue',
          productId: 'pop-999',
          colorName: 'Blue',
          orderIndex: 1,
        },
      ]);
      poColorSizeRepoMock.find.mockResolvedValue([
        {
          id: 's-1',
          productColorId: 'c-red',
          sizeLabel: 'M',
          quantity: 60,
          orderIndex: 0,
        },
        {
          id: 's-2',
          productColorId: 'c-blue',
          sizeLabel: 'L',
          quantity: 40,
          orderIndex: 0,
        },
      ]);

      jest
        .spyOn(bomCostService, 'calculateCurrentOrderQuantity')
        .mockResolvedValue(100); // 60 + 40

      const result = await service.findOne('po-uuid', 'ACCOUNTING');

      expect(result.id).toBe('po-uuid');
      expect(result.type).toBe(BomType.PO);
      expect(result.purchaseOrderProduct?.productCode).toBe('PROD-POLO');
      expect(result.purchaseOrderProduct?.colors).toHaveLength(2);
      expect(result.purchaseOrderProduct?.colors[0].totalQuantity).toBe(60);
      expect(result.purchaseOrderProduct?.colors[1].totalQuantity).toBe(40);
      expect(result.currentOrderQuantity).toBe(100); // Dynamic live quantity
      expect(result.costPerUnit).toBe(50);
      expect(result.currentOrderCost).toBe(5000); // 50 * 100
    });

    it('masks unit_cost and lineCost on all lines for NVKH and RD roles', async () => {
      const poBom = new Bom();
      poBom.id = 'po-uuid';
      poBom.bomType = BomType.PO;
      poBom.purchaseOrderProductId = 'pop-999';
      poBom.currentRevisionId = 'rev-po-1';

      const line = new BomLine();
      line.id = 'line-1';
      line.materialNameSnapshot = 'Cotton 100%';
      line.consumption = 2;
      line.unitCost = 25;

      bomRepoMock.findOne.mockResolvedValue(poBom);
      poProductRepoMock.findOne.mockResolvedValue(null);
      bomRevisionRepoMock.findOne.mockResolvedValue(null);
      bomLineRepoMock.find.mockResolvedValue([line]);
      jest
        .spyOn(bomCostService, 'calculateCurrentOrderQuantity')
        .mockResolvedValue(100);

      // Call as NVKH
      const resultNvkh = await service.findOne('po-uuid', 'NVKH');
      expect(resultNvkh.costPerUnit).toBeNull();
      expect(resultNvkh.currentOrderCost).toBeNull();
      expect(resultNvkh.lines[0].unitCost).toBeNull();
      expect(resultNvkh.lines[0].lineCost).toBeNull();

      // Call as RD
      const resultRd = await service.findOne('po-uuid', 'RD');
      expect(resultRd.costPerUnit).toBeNull();
      expect(resultRd.currentOrderCost).toBeNull();
      expect(resultRd.lines[0].unitCost).toBeNull();
      expect(resultRd.lines[0].lineCost).toBeNull();
    });

    it('throws NotFoundException when BOM does not exist', async () => {
      bomRepoMock.findOne.mockResolvedValue(null);
      await expect(service.findOne('invalid-uuid', 'SA')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. STATS (getStats)
  // ──────────────────────────────────────────────────────────────────────────
  describe('getStats', () => {
    it('aggregates BOM counts into draft, pending, approved, and discontinued groups', async () => {
      const qbMock = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { discontinuedAt: null, status: BomRevisionStatus.WAIT_NVKH },
          { discontinuedAt: null, status: BomRevisionStatus.WAIT_RD },
          { discontinuedAt: null, status: BomRevisionStatus.WAIT_TPKH_CONFIRM },
          { discontinuedAt: null, status: BomRevisionStatus.WAIT_ACCOUNTING },
          { discontinuedAt: null, status: BomRevisionStatus.WAIT_SA_APPROVE },
          { discontinuedAt: null, status: BomRevisionStatus.CLOSED },
          { discontinuedAt: new Date(), status: BomRevisionStatus.WAIT_RD }, // Discontinued
        ]),
      };
      bomRepoMock.createQueryBuilder.mockReturnValue(qbMock);

      const stats = await service.getStats({});

      expect(stats.total).toBe(7);
      expect(stats.draftCount).toBe(1); // wait_nvkh
      expect(stats.pendingCount).toBe(4); // wait_rd, wait_tpkh_confirm, wait_accounting, wait_sa_approve
      expect(stats.approvedCount).toBe(1); // closed
      expect(stats.discontinuedCount).toBe(1); // discontinued
      expect(stats.byStatus.discontinued).toBe(1);
      expect(stats.byStatus.closed).toBe(1);
    });
  });
});
