import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BomsService,
  isUserAllowedToViewCost,
  normalizeStatusQuery,
} from './boms.service';
import { BillOfMaterials } from './entities/BillOfMaterials.entity';
import { BillOfMaterialLine } from './entities/BillOfMaterialLine.entity';
import { FitBomLine } from '../fit-boms/entities/FitBomLine.entity';
import { Style } from '../styles/entities/Style.entity';

describe('BomsService', () => {
  let service: BomsService;
  let dataSourceMock: any;
  let bomRepoMock: any;
  let bomLineRepoMock: any;
  let fitBomLineRepoMock: any;
  let styleRepoMock: any;

  const allCombinedRows = [
    {
      id: 'po-bom-1',
      bom_code: 'BOM-PO-01',
      object_type: 'po',
      object_code: 'PO-2026-001',
      po_id: 'po-uuid-1',
      color_id: 'col-1',
      color_name: 'Navy',
      style_code: 'STY-POLO-01',
      product_name: 'Áo Polo Nam Classic Fit',
      po_quantity: 500,
      version: 1,
      status: 'Approved',
      total_cost: 145000,
      deadline: '2026-09-20T00:00:00.000Z',
      created_at: new Date('2026-09-10T10:00:00.000Z'),
    },
    {
      id: 'style-uuid-1',
      bom_code: 'FIT-STY-FIT-01',
      object_type: 'fit',
      object_code: 'FIT-STY-FIT-01',
      po_id: '',
      color_id: null,
      color_name: 'Tiêu chuẩn',
      style_code: 'STY-FIT-01',
      product_name: 'Mẫu Fit Polo',
      po_quantity: null,
      version: 1,
      status: 'Draft',
      total_cost: null,
      deadline: null,
      created_at: new Date('2026-09-08T08:30:00.000Z'),
    },
  ];

  beforeEach(async () => {
    bomRepoMock = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    bomLineRepoMock = {
      find: jest.fn(),
    };

    fitBomLineRepoMock = {
      find: jest.fn(),
    };

    styleRepoMock = {
      findOne: jest.fn(),
    };

    dataSourceMock = {
      query: jest
        .fn()
        .mockImplementation((queryText: string, params: any[] = []) => {
          if (queryText.includes('COUNT(*) FILTER')) {
            return Promise.resolve([
              {
                total: '2',
                draft_count: '1',
                pending_count: '0',
                approved_count: '1',
              },
            ]);
          }

          let rows = [...allCombinedRows];
          if (
            queryText.includes("'po'::text as object_type") &&
            !queryText.includes("'fit'::text as object_type")
          ) {
            rows = rows.filter((r) => r.object_type === 'po');
          } else if (
            queryText.includes("'fit'::text as object_type") &&
            !queryText.includes("'po'::text as object_type")
          ) {
            rows = rows.filter((r) => r.object_type === 'fit');
          }

          // Apply WHERE filter parameters
          for (const p of params) {
            if (typeof p === 'string') {
              if (p.startsWith('%') && p.endsWith('%')) {
                const val = p.slice(1, -1).toLowerCase();
                rows = rows.filter(
                  (r) =>
                    r.style_code.toLowerCase().includes(val) ||
                    r.product_name.toLowerCase().includes(val) ||
                    r.object_code.toLowerCase().includes(val) ||
                    (r.color_name && r.color_name.toLowerCase().includes(val)),
                );
              } else {
                rows = rows.filter(
                  (r) => r.status.toLowerCase() === p.toLowerCase(),
                );
              }
            }
          }

          if (queryText.includes('COUNT(*)')) {
            return Promise.resolve([{ count: String(rows.length) }]);
          }

          // Handle LIMIT and OFFSET
          const limitParam = params[params.length - 2];
          const offsetParam = params[params.length - 1];
          if (
            typeof limitParam === 'number' &&
            typeof offsetParam === 'number'
          ) {
            rows = rows.slice(offsetParam, offsetParam + limitParam);
          }

          return Promise.resolve(rows);
        }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomsService,
        { provide: getRepositoryToken(BillOfMaterials), useValue: bomRepoMock },
        {
          provide: getRepositoryToken(BillOfMaterialLine),
          useValue: bomLineRepoMock,
        },
        {
          provide: getRepositoryToken(FitBomLine),
          useValue: fitBomLineRepoMock,
        },
        { provide: getRepositoryToken(Style), useValue: styleRepoMock },
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

  describe('normalizeStatusQuery', () => {
    it('normalizes raw database enum values and UI labels to common keys', () => {
      expect(normalizeStatusQuery('closed')).toBe('approved');
      expect(normalizeStatusQuery('Approved')).toBe('approved');
      expect(normalizeStatusQuery('active')).toBe('approved');
      expect(normalizeStatusQuery('wait_accounting')).toBe('wait_price');
      expect(normalizeStatusQuery('Wait_Price')).toBe('wait_price');
      expect(normalizeStatusQuery('wait_rd')).toBe('wait_rd');
      expect(normalizeStatusQuery('Wait_RD')).toBe('wait_rd');
      expect(normalizeStatusQuery('wait_tpkh_confirm')).toBe('wait_tp_approve');
      expect(normalizeStatusQuery('Wait_TP_Approve')).toBe('wait_tp_approve');
      expect(normalizeStatusQuery('wait_sa_approve')).toBe('wait_sa_approve');
      expect(normalizeStatusQuery('Wait_SA_Approve')).toBe('wait_sa_approve');
      expect(normalizeStatusQuery('draft')).toBe('draft');
      expect(normalizeStatusQuery('Draft')).toBe('draft');
      expect(normalizeStatusQuery('locked')).toBe('locked');
      expect(normalizeStatusQuery(null)).toBe('');
      expect(normalizeStatusQuery(undefined)).toBe('');
    });
  });

  describe('findAll', () => {
    it('returns both PO and Fit BOMs with costs for PO only for TPKH', async () => {
      const res = await service.findAll(undefined, { roleCode: 'TPKH' });
      expect(res.data).toHaveLength(2);
      expect(res.meta.total).toBe(2);

      const poItem = res.data.find((i) => i.objectType === 'po');
      const fitItem = res.data.find((i) => i.objectType === 'fit');

      expect(poItem).toBeDefined();
      expect(poItem?.objectCode).toBe('PO-2026-001');
      expect(poItem?.totalCostPerUnit).toBe(145000);

      // Fit BOM has NO production cost according to business logic (always null)
      expect(fitItem).toBeDefined();
      expect(fitItem?.objectCode).toBe('FIT-STY-FIT-01');
      expect(fitItem?.totalCostPerUnit).toBeNull();
    });

    it('masks totalCostPerUnit to null for NVKH and RD', async () => {
      const nvkhRes = await service.findAll(undefined, { roleCode: 'NVKH' });
      expect(nvkhRes.data[0].totalCostPerUnit).toBeNull();
      expect(nvkhRes.data[1].totalCostPerUnit).toBeNull();

      const rdRes = await service.findAll(undefined, { roleCode: 'RD' });
      expect(rdRes.data[0].totalCostPerUnit).toBeNull();
      expect(rdRes.data[1].totalCostPerUnit).toBeNull();
    });

    it('filters by objectType: po', async () => {
      const res = await service.findAll(
        { objectType: 'po' },
        { roleCode: 'SA' },
      );
      expect(res.data.every((i) => i.objectType === 'po')).toBe(true);
      expect(res.data).toHaveLength(1);
      expect(res.meta.total).toBe(1);
    });

    it('filters by objectType: fit', async () => {
      const res = await service.findAll(
        { objectType: 'fit' },
        { roleCode: 'SA' },
      );
      expect(res.data.every((i) => i.objectType === 'fit')).toBe(true);
      expect(res.data).toHaveLength(1);
      expect(res.meta.total).toBe(1);
    });

    it('filters by search keyword', async () => {
      const res = await service.findAll({ search: 'Polo' }, { roleCode: 'SA' });
      expect(res.data).toHaveLength(2);

      const nonExistent = await service.findAll(
        { search: 'NonExistent' },
        { roleCode: 'SA' },
      );
      expect(nonExistent.data).toHaveLength(0);
      expect(nonExistent.meta.total).toBe(0);
    });

    it('filters by color', async () => {
      const navyRes = await service.findAll(
        { colorName: 'Navy' },
        { roleCode: 'SA' },
      );
      expect(navyRes.data).toHaveLength(1);
      expect(navyRes.data[0].colorName).toBe('Navy');
    });

    it('filters by status using raw database enum values like closed', async () => {
      const closedRes = await service.findAll(
        { status: 'closed' },
        { roleCode: 'SA' },
      );
      expect(closedRes.data).toHaveLength(1);
      expect(closedRes.data[0].status).toBe('Approved');
    });

    it('paginates correctly with page and limit', async () => {
      const resPage1 = await service.findAll(
        { page: 1, limit: 1 },
        { roleCode: 'SA' },
      );
      expect(resPage1.data).toHaveLength(1);
      expect(resPage1.meta.total).toBe(2);
      expect(resPage1.meta.page).toBe(1);
      expect(resPage1.meta.limit).toBe(1);
      expect(resPage1.meta.totalPages).toBe(2);

      const resPage2 = await service.findAll(
        { page: 2, limit: 1 },
        { roleCode: 'SA' },
      );
      expect(resPage2.data).toHaveLength(1);
      expect(resPage2.meta.page).toBe(2);
      expect(resPage2.data[0].id).not.toBe(resPage1.data[0].id);
    });
  });

  describe('findOne', () => {
    it('returns PO BOM detail with cost for authorized user', async () => {
      bomRepoMock.findOne.mockResolvedValueOnce({
        id: 'po-1',
        poCodeSnapshot: 'PO-100',
        status: 'closed',
      });
      bomLineRepoMock.find.mockResolvedValueOnce([
        { consumptionPerUnit: 2, unitCost: 20000 },
      ]);

      const result = await service.findOne('po-1', { roleCode: 'SA' });
      expect(result.objectType).toBe('po');
      expect(result.totalCostPerUnit).toBe(40000);
      expect(result.bomLines[0].unitCost).toBe(20000);
    });

    it('returns Fit BOM detail pointing directly to style and lines, with null cost', async () => {
      bomRepoMock.findOne.mockResolvedValueOnce(null);
      styleRepoMock.findOne.mockResolvedValueOnce({
        id: 'style-1',
        styleCode: 'STY-FIT-01',
        styleName: 'Fit Polo',
        status: 'active',
        createdAt: new Date(),
      });
      fitBomLineRepoMock.find.mockResolvedValueOnce([
        {
          id: 'line-1',
          materialNameSnapshot: 'Vải cotton',
          materialGroupSnapshot: 'Vải chính',
          unitSnapshot: 'Mét',
          consumption: 1.5,
        },
      ]);

      const result = await service.findOne('style-1', { roleCode: 'SA' });
      expect(result.objectType).toBe('fit');
      expect(result.bomCode).toBe('FIT-STY-FIT-01');
      expect(result.totalCostPerUnit).toBeNull();
      expect(result.bomLines).toHaveLength(1);
      expect(result.bomLines[0].materialGroupSnapshot).toBe('Vải chính');
      expect(result.bomLines[0].unitSnapshot).toBe('Mét');
    });
  });

  describe('getStats', () => {
    it('returns aggregate statistics for period', async () => {
      const stats = await service.getStats('2026-09');
      expect(stats).toEqual({
        total: 2,
        draftCount: 1,
        pendingCount: 0,
        approvedCount: 1,
      });
      expect(dataSourceMock.query).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*) FILTER'),
        ['2026-09'],
      );
    });

    it('returns aggregate statistics for all periods when period is all or omitted', async () => {
      const stats = await service.getStats('all');
      expect(stats).toEqual({
        total: 2,
        draftCount: 1,
        pendingCount: 0,
        approvedCount: 1,
      });
      expect(dataSourceMock.query).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*) FILTER'),
        [],
      );
    });
  });
});
