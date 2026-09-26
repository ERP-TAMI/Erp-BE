import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BomCostService } from '../bom-cost.service';
import { BomLine } from '../entities/BomLine.entity';
import { PurchaseOrderProductColorSize } from '../../purchase-orders/entities/PurchaseOrderProductColorSize.entity';
import { PurchaseOrderProductColor } from '../../purchase-orders/entities/PurchaseOrderProductColor.entity';
import { BomType } from '../../../common/enums/database.enums';

describe('BomCostService (Cost Calculation & Role Masking)', () => {
  let service: BomCostService;
  let bomLineRepoMock: any;
  let poColorSizeRepoMock: any;
  let poColorRepoMock: any;

  beforeEach(async () => {
    bomLineRepoMock = {
      createQueryBuilder: jest.fn(),
    };
    poColorSizeRepoMock = {
      createQueryBuilder: jest.fn(),
    };
    poColorRepoMock = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomCostService,
        {
          provide: getRepositoryToken(BomLine),
          useValue: bomLineRepoMock,
        },
        {
          provide: getRepositoryToken(PurchaseOrderProductColorSize),
          useValue: poColorSizeRepoMock,
        },
        {
          provide: getRepositoryToken(PurchaseOrderProductColor),
          useValue: poColorRepoMock,
        },
      ],
    }).compile();

    service = module.get<BomCostService>(BomCostService);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. COST PER UNIT CALCULATION
  // ──────────────────────────────────────────────────────────────────────────
  describe('calculateCostPerUnit', () => {
    it('1. calculates costPerUnit with multiple lines correctly (line A: 2*10=20, line B: 3*5=15 => 35)', () => {
      const lineA = new BomLine();
      lineA.consumption = 2;
      lineA.unitCost = 10;

      const lineB = new BomLine();
      lineB.consumption = 3;
      lineB.unitCost = 5;

      const costPerUnit = service.calculateCostPerUnit([lineA, lineB]);
      expect(costPerUnit).toBe(35);
    });

    it('2. handles unit_cost = 0 as valid and contributing 0 to total', () => {
      const lineA = new BomLine();
      lineA.consumption = 2;
      lineA.unitCost = 10; // 20

      const lineB = new BomLine();
      lineB.consumption = 5;
      lineB.unitCost = 0; // 0 (Free material or customer provided)

      const costPerUnit = service.calculateCostPerUnit([lineA, lineB]);
      expect(costPerUnit).toBe(20);
    });

    it('3. does NOT convert unit_cost = NULL to 0; returns null when price is incomplete', () => {
      const lineA = new BomLine();
      lineA.consumption = 2;
      lineA.unitCost = 10;

      const lineB = new BomLine();
      lineB.consumption = 3;
      lineB.unitCost = null; // Unpriced material

      const costPerUnit = service.calculateCostPerUnit([lineA, lineB]);
      // Must NOT convert NULL to 0 and claim cost is 20
      expect(costPerUnit).toBeNull();
    });

    it('4. returns null for empty revision lines', () => {
      expect(service.calculateCostPerUnit([])).toBeNull();
      expect(service.calculateCostPerUnit(null)).toBeNull();
      expect(service.calculateCostPerUnit(undefined)).toBeNull();
    });

    it('handles decimal string representations from PostgreSQL numeric without precision loss', () => {
      const lineA = new BomLine();
      (lineA as any).consumption = '0.350000';
      (lineA as any).unitCost = '120.50';

      const lineB = new BomLine();
      (lineB as any).consumption = '1.200000';
      (lineB as any).unitCost = '50.00';

      // 0.35 * 120.50 = 42.175, 1.2 * 50 = 60 => 102.175 (4 decimal places: 102.175)
      const costPerUnit = service.calculateCostPerUnit([lineA, lineB]);
      expect(costPerUnit).toBe(102.175);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. CURRENT ORDER QUANTITY
  // ──────────────────────────────────────────────────────────────────────────
  describe('calculateCurrentOrderQuantity', () => {
    it('6. PO BOM calculates currentOrderQuantity dynamically from PO color sizes', async () => {
      const qbMock = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalQuantity: 450 }),
      };
      poColorSizeRepoMock.createQueryBuilder.mockReturnValue(qbMock);

      const qty = await service.calculateCurrentOrderQuantity('pop-uuid-1');
      expect(qty).toBe(450);
      expect(qbMock.where).toHaveBeenCalledWith(
        'c.product_id = :purchaseOrderProductId',
        { purchaseOrderProductId: 'pop-uuid-1' },
      );
    });

    it('returns 0 if product has no color sizes in PO', async () => {
      const qbMock = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(null),
      };
      poColorSizeRepoMock.createQueryBuilder.mockReturnValue(qbMock);

      const qty = await service.calculateCurrentOrderQuantity('pop-empty');
      expect(qty).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. CURRENT ORDER COST
  // ──────────────────────────────────────────────────────────────────────────
  describe('calculateCurrentOrderCost', () => {
    it('5. Fit BOM has NO currentOrderCost (returns null)', () => {
      const cost = service.calculateCurrentOrderCost({
        bomType: BomType.FIT,
        costPerUnit: 35,
        currentOrderQuantity: 100, // Even if passed, Fit BOM must return null
      });
      expect(cost).toBeNull();
    });

    it('7. PO BOM calculates currentOrderCost correctly (costPerUnit * currentOrderQuantity)', () => {
      const cost = service.calculateCurrentOrderCost({
        bomType: BomType.PO,
        costPerUnit: 35,
        currentOrderQuantity: 100,
      });
      expect(cost).toBe(3500);
    });

    it('returns null if costPerUnit is null', () => {
      const cost = service.calculateCurrentOrderCost({
        bomType: BomType.PO,
        costPerUnit: null,
        currentOrderQuantity: 100,
      });
      expect(cost).toBeNull();
    });

    it('8. dynamically recalculates currentOrderCost when quantity in PO changes without touching BOM', () => {
      const costPerUnit = 10;

      // Old quantity = 100
      const oldOrderCost = service.calculateCurrentOrderCost({
        bomType: BomType.PO,
        costPerUnit,
        currentOrderQuantity: 100,
      });
      expect(oldOrderCost).toBe(1000);

      // Quantity changed in PO to 120
      const newOrderCost = service.calculateCurrentOrderCost({
        bomType: BomType.PO,
        costPerUnit,
        currentOrderQuantity: 120,
      });
      expect(newOrderCost).toBe(1200);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. ROLE & COST VISIBILITY
  // ──────────────────────────────────────────────────────────────────────────
  describe('Role / Cost Visibility (isCostVisible)', () => {
    it('allows SA, TPKH, and ACCOUNTING to view costs', () => {
      expect(service.isCostVisible('SA')).toBe(true);
      expect(service.isCostVisible('sa')).toBe(true);
      expect(service.isCostVisible('TPKH')).toBe(true);
      expect(service.isCostVisible('tpkh')).toBe(true);
      expect(service.isCostVisible('ACCOUNTING')).toBe(true);
      expect(service.isCostVisible('accounting')).toBe(true);
    });

    it('masks/hides costs for NVKH, RD, and IT (returns false)', () => {
      expect(service.isCostVisible('NVKH')).toBe(false);
      expect(service.isCostVisible('nvkh')).toBe(false);
      expect(service.isCostVisible('RD')).toBe(false);
      expect(service.isCostVisible('rd')).toBe(false);
      expect(service.isCostVisible('IT')).toBe(false);
      expect(service.isCostVisible(null)).toBe(false);
      expect(service.isCostVisible(undefined)).toBe(false);
      expect(service.isCostVisible('')).toBe(false);
    });
  });
});
