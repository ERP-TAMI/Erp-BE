import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BomsService, isUserAllowedToViewCost } from './boms.service';
import { BillOfMaterials } from './entities/BillOfMaterials.entity';
import { BillOfMaterialLine } from './entities/BillOfMaterialLine.entity';
import { DraftBomFamilie } from '../draft-boms/entities/DraftBomFamilie.entity';
import { DraftBomVersion } from '../draft-boms/entities/DraftBomVersion.entity';
import { DraftBomLine } from '../draft-boms/entities/DraftBomLine.entity';
import { Style } from '../styles/entities/Style.entity';
import { PurchaseOrder } from '../purchase-orders/entities/PurchaseOrder.entity';
import { PurchaseOrderProduct } from '../purchase-orders/entities/PurchaseOrderProduct.entity';
import { PurchaseOrderProductColor } from '../purchase-orders/entities/PurchaseOrderProductColor.entity';
import { Material } from '../master-data/entities/Material.entity';

describe('BomsService', () => {
  let service: BomsService;
  let dataSourceMock: any;
  let bomRepoMock: any;
  let draftBomRepoMock: any;

  const mockPoRows = [
    {
      id: 'po-bom-1',
      bom_code: 'BOM-PO-01',
      po_code_snapshot: 'PO-2026-001',
      product_code_snapshot: 'STY-POLO-01',
      product_name_snapshot: 'Áo Polo Nam Classic Fit',
      color_name_snapshot: 'Navy',
      order_quantity_snapshot: 500,
      deadline: '2026-09-20T00:00:00.000Z',
      status: 'closed',
      row_version: 1,
      created_at: '2026-09-10T10:00:00.000Z',
      color_id: 'col-1',
      po_id: 'po-uuid-1',
      total_cost: 145000,
    },
  ];

  const mockFitRows = [
    {
      id: 'fit-bom-1',
      bom_code: 'FIT-2026-001',
      created_at: '2026-09-08T08:30:00.000Z',
      style_id: 'style-uuid-1',
      style_code: 'STY-FIT-01',
      style_name: 'Mẫu Fit Polo',
      style_status: 'draft',
      version_no: 1,
      version_id: 'ver-1',
      total_cost: 120000,
    },
  ];

  beforeEach(async () => {
    bomRepoMock = {
      count: jest.fn().mockResolvedValue(1),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    draftBomRepoMock = {
      count: jest.fn().mockResolvedValue(1),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    dataSourceMock = {
      query: jest.fn().mockImplementation((queryText: string) => {
        if (queryText.includes('FROM bills_of_materials')) {
          return Promise.resolve(mockPoRows);
        }
        if (queryText.includes('FROM draft_bom_families')) {
          return Promise.resolve(mockFitRows);
        }
        return Promise.resolve([]);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomsService,
        { provide: getRepositoryToken(BillOfMaterials), useValue: bomRepoMock },
        { provide: getRepositoryToken(BillOfMaterialLine), useValue: {} },
        { provide: getRepositoryToken(DraftBomFamilie), useValue: draftBomRepoMock },
        { provide: getRepositoryToken(DraftBomVersion), useValue: {} },
        { provide: getRepositoryToken(DraftBomLine), useValue: {} },
        { provide: getRepositoryToken(Style), useValue: {} },
        { provide: getRepositoryToken(PurchaseOrder), useValue: {} },
        { provide: getRepositoryToken(PurchaseOrderProduct), useValue: {} },
        { provide: getRepositoryToken(PurchaseOrderProductColor), useValue: {} },
        { provide: getRepositoryToken(Material), useValue: {} },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get<BomsService>(BomsService);
  });

  describe('isUserAllowedToViewCost', () => {
    it('allows TPKH, ACCOUNTING, KT, SA', () => {
      expect(isUserAllowedToViewCost({ roleCode: 'TPKH' })).toBe(true);
      expect(isUserAllowedToViewCost({ roleCode: 'tpkh' })).toBe(true);
      expect(isUserAllowedToViewCost({ roleCode: 'ACCOUNTING' })).toBe(true);
      expect(isUserAllowedToViewCost({ roleCode: 'KT' })).toBe(true);
      expect(isUserAllowedToViewCost({ roleCode: 'SA' })).toBe(true);
      expect(isUserAllowedToViewCost({ roleCode: 'GIAM_DOC' })).toBe(true);
    });

    it('denies NVKH and RD', () => {
      expect(isUserAllowedToViewCost({ roleCode: 'NVKH' })).toBe(false);
      expect(isUserAllowedToViewCost({ roleCode: 'RD' })).toBe(false);
      expect(isUserAllowedToViewCost(undefined)).toBe(false);
      expect(isUserAllowedToViewCost(null)).toBe(false);
    });
  });

  describe('findAll', () => {
    it('returns both PO and Fit BOMs with costs for TPKH', async () => {
      const items = await service.findAll(undefined, { roleCode: 'TPKH' });
      expect(items).toHaveLength(2);

      const poItem = items.find((i) => i.objectType === 'po');
      const fitItem = items.find((i) => i.objectType === 'fit');

      expect(poItem).toBeDefined();
      expect(poItem?.objectCode).toBe('PO-2026-001');
      expect(poItem?.totalCostPerUnit).toBe(145000);

      expect(fitItem).toBeDefined();
      expect(fitItem?.objectCode).toBe('FIT-2026-001');
      expect(fitItem?.totalCostPerUnit).toBe(120000);
    });

    it('masks totalCostPerUnit to null for NVKH and RD', async () => {
      const nvkhItems = await service.findAll(undefined, { roleCode: 'NVKH' });
      expect(nvkhItems[0].totalCostPerUnit).toBeNull();
      expect(nvkhItems[1].totalCostPerUnit).toBeNull();

      const rdItems = await service.findAll(undefined, { roleCode: 'RD' });
      expect(rdItems[0].totalCostPerUnit).toBeNull();
      expect(rdItems[1].totalCostPerUnit).toBeNull();
    });

    it('filters by objectType: po', async () => {
      const items = await service.findAll({ objectType: 'po' }, { roleCode: 'SA' });
      expect(items.every((i) => i.objectType === 'po')).toBe(true);
      expect(items).toHaveLength(1);
    });

    it('filters by objectType: fit', async () => {
      const items = await service.findAll({ objectType: 'fit' }, { roleCode: 'SA' });
      expect(items.every((i) => i.objectType === 'fit')).toBe(true);
      expect(items).toHaveLength(1);
    });

    it('filters by search keyword', async () => {
      const items = await service.findAll({ search: 'Polo' }, { roleCode: 'SA' });
      expect(items).toHaveLength(2);

      const nonExistent = await service.findAll({ search: 'NonExistent' }, { roleCode: 'SA' });
      expect(nonExistent).toHaveLength(0);
    });

    it('filters by color', async () => {
      const navyItems = await service.findAll({ colorName: 'Navy' }, { roleCode: 'SA' });
      expect(navyItems).toHaveLength(1);
      expect(navyItems[0].colorName).toBe('Navy');
    });
  });
});
