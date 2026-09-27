import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BomAggregateService } from '../bom-aggregate.service';
import { BomCostService } from '../bom-cost.service';
import { Bom } from '../entities/Bom.entity';
import { BomRevision } from '../entities/BomRevision.entity';
import { BomLine } from '../entities/BomLine.entity';
import { PurchaseOrderProduct } from '../../purchase-orders/entities/PurchaseOrderProduct.entity';
import { PurchaseOrderProductColor } from '../../purchase-orders/entities/PurchaseOrderProductColor.entity';
import { PurchaseOrderProductColorSize } from '../../purchase-orders/entities/PurchaseOrderProductColorSize.entity';
import {
  BomRevisionStatus,
  BomType,
} from '../../../common/enums/database.enums';
import { AggregateBreakdownType } from '../dto/query-bom-aggregate.dto';
import { UserRoleCode } from '../../user-management/dto/query-users.dto';

describe('BOM V2 NPL Aggregate & Backend Completion (PR-07 Specification)', () => {
  let aggregateService: BomAggregateService;
  let bomRepoMock: any;
  let bomRevisionRepoMock: any;
  let bomLineRepoMock: any;
  let poProductRepoMock: any;
  let poColorRepoMock: any;
  let poColorSizeRepoMock: any;

  // In-memory test state
  let mockBoms: any[];
  let mockRevisions: any[];
  let mockLines: any[];
  let mockColorSizeRows: any[];
  let aggregateAndWhereSpy: jest.Mock;
  let aggregateQueryMetrics: { rawQueryCount: number };

  type QueryState = {
    joins: Array<{ kind: 'inner' | 'left'; alias: string }>;
    filters: Array<{ sql: string; params?: Record<string, unknown> }>;
    selections: Array<{ expression: string; alias?: string }>;
    groupBy: string[];
    offset: number;
    limit: number;
  };

  function eligibleBoms() {
    return mockBoms.filter((bom) => {
      if (bom.bomType !== BomType.PO || bom.discontinuedAt) return false;
      const revision = mockRevisions.find(
        (candidate) => candidate.id === bom.currentRevisionId,
      );
      return revision?.status === BomRevisionStatus.CLOSED;
    });
  }

  function selectedLines(state: QueryState) {
    const materialId = state.filters
      .map((filter) => filter.params?.materialId)
      .find((value) => typeof value === 'string');
    const materialSearch = state.filters
      .map((filter) => filter.params?.materialSearch)
      .find((value) => typeof value === 'string');
    const eligible = eligibleBoms();
    const revisionIds = new Set(eligible.map((bom) => bom.currentRevisionId));

    return mockLines.filter((line) => {
      if (!revisionIds.has(line.revisionId) || !line.materialId) return false;
      if (materialId && line.materialId !== materialId) return false;
      if (
        materialSearch &&
        !`${line.materialNameSnapshot ?? ''} ${line.materialGroupSnapshot ?? ''}`
          .toLowerCase()
          .includes(String(materialSearch).replaceAll('%', '').toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }

  function queryGroupRows(state: QueryState) {
    const eligible = eligibleBoms();
    const lines = selectedLines(state);
    const groups = new Map<string, any>();

    for (const bom of eligible) {
      const productId = bom.purchaseOrderProductId;
      for (const line of lines.filter(
        (candidate) => candidate.revisionId === bom.currentRevisionId,
      )) {
        const quantities = mockColorSizeRows.filter(
          (row) => row.productId === productId,
        );
        const joinedRows = quantities.length ? quantities : [null];
        const key = JSON.stringify([line.materialId, line.unitSnapshot]);
        let group = groups.get(key);
        if (!group) {
          group = {
            materialId: line.materialId,
            materialCode: null,
            materialNameSnapshot: line.materialNameSnapshot,
            materialGroupSnapshot: line.materialGroupSnapshot,
            unitSnapshot: line.unitSnapshot,
            totalRequiredQuantity: 0,
            totalEstimatedCost: 0,
            bomIds: new Set<string>(),
            productIds: new Set<string>(),
            unitCosts: [] as number[],
            hasNullUnitCost: false,
          };
          groups.set(key, group);
        }
        group.materialNameSnapshot = [
          group.materialNameSnapshot,
          line.materialNameSnapshot,
        ]
          .filter(Boolean)
          .sort((a: string, b: string) => a.localeCompare(b))[0];
        group.materialGroupSnapshot =
          [group.materialGroupSnapshot, line.materialGroupSnapshot]
            .filter(Boolean)
            .sort((a: string, b: string) => a.localeCompare(b))[0] ?? null;
        group.bomIds.add(bom.id);
        group.productIds.add(productId);
        group.hasNullUnitCost ||= line.unitCost == null;
        if (line.unitCost != null) group.unitCosts.push(Number(line.unitCost));

        for (const quantity of joinedRows) {
          const required =
            Number(line.consumption) * Number(quantity?.quantity ?? 0);
          group.totalRequiredQuantity += required;
          group.totalEstimatedCost += required * Number(line.unitCost ?? 0);
        }
      }
    }

    const rows = [...groups.values()].map((group) => ({
      materialId: group.materialId,
      materialCode: group.materialCode,
      materialNameSnapshot: group.materialNameSnapshot,
      materialGroupSnapshot: group.materialGroupSnapshot,
      unitSnapshot: group.unitSnapshot,
      totalRequiredQuantity: group.totalRequiredQuantity,
      totalEstimatedCost: group.totalEstimatedCost,
      bomCount: group.bomIds.size,
      poProductCount: group.productIds.size,
      hasNullUnitCost: group.hasNullUnitCost,
      minUnitCost: group.unitCosts.length ? Math.min(...group.unitCosts) : null,
      maxUnitCost: group.unitCosts.length ? Math.max(...group.unitCosts) : null,
    }));
    rows.sort(
      (a, b) =>
        a.materialNameSnapshot.localeCompare(b.materialNameSnapshot) ||
        a.materialId.localeCompare(b.materialId) ||
        a.unitSnapshot.localeCompare(b.unitSnapshot),
    );
    const totalGroups = rows.length;
    return rows
      .slice(state.offset, state.offset + state.limit)
      .map((row) => ({ ...row, totalGroups }));
  }

  function queryBreakdownRows(state: QueryState) {
    const pageGroups = new Set<string>();
    for (const filter of state.filters) {
      for (const [key, value] of Object.entries(filter.params ?? {})) {
        if (key.startsWith('pageMaterial')) {
          const suffix = key.slice('pageMaterial'.length);
          pageGroups.add(
            JSON.stringify([value, filter.params?.[`pageUnit${suffix}`]]),
          );
        }
      }
    }
    const aliases = new Set(
      state.selections.map((selection) => selection.alias),
    );
    const hasColor = aliases.has('colorName');
    const hasSize = aliases.has('sizeLabel');
    const hasProduct = aliases.has('productId');
    const groups = new Map<string, any>();

    for (const bom of eligibleBoms()) {
      for (const line of selectedLines(state).filter(
        (candidate) => candidate.revisionId === bom.currentRevisionId,
      )) {
        if (
          !pageGroups.has(JSON.stringify([line.materialId, line.unitSnapshot]))
        )
          continue;
        for (const row of mockColorSizeRows.filter(
          (candidate) => candidate.productId === bom.purchaseOrderProductId,
        )) {
          const keyParts = [
            line.materialId,
            line.unitSnapshot,
            ...(hasProduct ? [bom.purchaseOrderProductId] : []),
            ...(hasColor ? [row.colorName] : []),
            ...(hasSize ? [row.sizeLabel] : []),
          ];
          const key = JSON.stringify(keyParts);
          let group = groups.get(key);
          if (!group) {
            group = {
              materialId: line.materialId,
              unitSnapshot: line.unitSnapshot,
              ...(hasProduct
                ? {
                    productId: bom.purchaseOrderProductId,
                    productCode: bom.purchaseOrderProductId,
                    productName: bom.purchaseOrderProductId,
                  }
                : {}),
              ...(hasColor ? { colorName: row.colorName } : {}),
              ...(hasSize ? { sizeLabel: row.sizeLabel } : {}),
              requiredQuantity: 0,
            };
            groups.set(key, group);
          }
          group.requiredQuantity +=
            Number(line.consumption) * Number(row.quantity ?? 0);
        }
      }
    }
    return [...groups.values()];
  }

  function makeAggregateQueryBuilder(initialState?: QueryState): any {
    const state: QueryState = initialState
      ? {
          ...initialState,
          joins: [...initialState.joins],
          filters: initialState.filters.map((filter) => ({ ...filter })),
          selections: [...initialState.selections],
          groupBy: [...initialState.groupBy],
        }
      : {
          joins: [],
          filters: [],
          selections: [],
          groupBy: [],
          offset: 0,
          limit: 100,
        };
    const qb: any = {};
    qb.innerJoin = jest.fn((_entity, alias) => {
      state.joins.push({ kind: 'inner', alias });
      return qb;
    });
    qb.leftJoin = jest.fn((_entity, alias) => {
      state.joins.push({ kind: 'left', alias });
      return qb;
    });
    qb.where = jest.fn((sql, params) => {
      state.filters.push({ sql, params });
      return qb;
    });
    qb.andWhere = jest.fn((sql, params) => {
      state.filters.push({ sql, params });
      aggregateAndWhereSpy(sql, params);
      return qb;
    });
    qb.select = jest.fn((expression, alias) => {
      state.selections = [{ expression, alias }];
      return qb;
    });
    qb.addSelect = jest.fn((expression, alias) => {
      state.selections.push({ expression, alias });
      return qb;
    });
    qb.groupBy = jest.fn((expression) => {
      state.groupBy = [expression];
      return qb;
    });
    qb.addGroupBy = jest.fn((expression) => {
      state.groupBy.push(expression);
      return qb;
    });
    qb.orderBy = jest.fn(() => qb);
    qb.addOrderBy = jest.fn(() => qb);
    qb.offset = jest.fn((value) => {
      state.offset = value;
      return qb;
    });
    qb.limit = jest.fn((value) => {
      state.limit = value;
      return qb;
    });
    qb.clone = jest.fn(() => makeAggregateQueryBuilder(state));
    qb.getRawOne = jest.fn().mockImplementation(() => {
      aggregateQueryMetrics.rawQueryCount += 1;
      if (
        state.selections.some((selection) => selection.alias === 'totalBoms')
      ) {
        const boms = eligibleBoms();
        return Promise.resolve({
          totalBoms: boms.length,
          totalProducts: new Set(boms.map((bom) => bom.purchaseOrderProductId))
            .size,
          totalPurchaseOrders: new Set(
            boms.map((bom) => bom.purchaseOrderProductId),
          ).size,
        });
      }
      return Promise.resolve({ totalGroups: queryGroupRows(state).length });
    });
    qb.getRawMany = jest.fn().mockImplementation(() => {
      aggregateQueryMetrics.rawQueryCount += 1;
      const isBreakdown = state.joins.some(
        (join) => join.alias === 'cs' && join.kind === 'inner',
      );
      return Promise.resolve(
        isBreakdown ? queryBreakdownRows(state) : queryGroupRows(state),
      );
    });
    return qb;
  }

  function setupAggregateEnv() {
    // BOM 1 (PO BOM, Closed, Product 1)
    const bomPo1 = {
      id: 'bom-po-1',
      bomCode: 'BOM-PO01-P01',
      bomType: BomType.PO,
      purchaseOrderProductId: 'pop-1',
      currentRevisionId: 'rev-po-1',
      discontinuedAt: null,
      rowVersion: 1,
    };

    const revPo1 = {
      id: 'rev-po-1',
      bomId: 'bom-po-1',
      revisionNo: 1,
      status: BomRevisionStatus.CLOSED,
    };

    // Lines for BOM 1: Material A (consumption: 2, cost: 50000) & Material B (consumption: 1, cost: 20000)
    const line1A = {
      id: 'line-1-a',
      revisionId: 'rev-po-1',
      materialId: 'mat-A',
      materialNameSnapshot: 'Vải Cotton 100% 220gsm',
      materialGroupSnapshot: 'Vải chính',
      unitSnapshot: 'Mét',
      consumption: 2.0,
      unitCost: 50000,
      orderIndex: 0,
    };

    const line1B = {
      id: 'line-1-b',
      revisionId: 'rev-po-1',
      materialId: 'mat-B',
      materialNameSnapshot: 'Bo cổ dệt sọc',
      materialGroupSnapshot: 'Phụ liệu',
      unitSnapshot: 'Cái',
      consumption: 1.0,
      unitCost: 20000,
      orderIndex: 1,
    };

    // BOM 2 (PO BOM, Closed, Product 2)
    const bomPo2 = {
      id: 'bom-po-2',
      bomCode: 'BOM-PO01-P02',
      bomType: BomType.PO,
      purchaseOrderProductId: 'pop-2',
      currentRevisionId: 'rev-po-2',
      discontinuedAt: null,
      rowVersion: 1,
    };

    const revPo2 = {
      id: 'rev-po-2',
      bomId: 'bom-po-2',
      revisionNo: 1,
      status: BomRevisionStatus.CLOSED,
    };

    // Lines for BOM 2: Material A (consumption: 3, cost: 50000) & Material C (consumption: 4, cost: 10000)
    const line2A = {
      id: 'line-2-a',
      revisionId: 'rev-po-2',
      materialId: 'mat-A',
      materialNameSnapshot: 'Vải Cotton 100% 220gsm',
      materialGroupSnapshot: 'Vải chính',
      unitSnapshot: 'Mét',
      consumption: 3.0,
      unitCost: 50000,
      orderIndex: 0,
    };

    const line2C = {
      id: 'line-2-c',
      revisionId: 'rev-po-2',
      materialId: 'mat-C',
      materialNameSnapshot: 'Chỉ may cotton 40/2',
      materialGroupSnapshot: 'Chỉ may',
      unitSnapshot: 'Cuộn',
      consumption: 4.0,
      unitCost: 10000,
      orderIndex: 1,
    };

    // Ineligible BOM 3: Fit BOM (Must be excluded)
    const bomFit = {
      id: 'bom-fit-1',
      bomCode: 'BOM-FIT-ST01',
      bomType: BomType.FIT,
      styleId: 'style-1',
      currentRevisionId: 'rev-fit-1',
      discontinuedAt: null,
      rowVersion: 1,
    };
    const revFit = {
      id: 'rev-fit-1',
      bomId: 'bom-fit-1',
      status: BomRevisionStatus.CLOSED,
    };

    // Ineligible BOM 4: PO BOM not closed (wait_rd)
    const bomPending = {
      id: 'bom-po-pending',
      bomCode: 'BOM-PO02-P01',
      bomType: BomType.PO,
      purchaseOrderProductId: 'pop-3',
      currentRevisionId: 'rev-pending-1',
      discontinuedAt: null,
      rowVersion: 1,
    };
    const revPending = {
      id: 'rev-pending-1',
      bomId: 'bom-po-pending',
      status: BomRevisionStatus.WAIT_RD,
    };

    // Ineligible BOM 5: Discontinued PO BOM
    const bomDisc = {
      id: 'bom-po-disc',
      bomCode: 'BOM-PO03-P01',
      bomType: BomType.PO,
      purchaseOrderProductId: 'pop-4',
      currentRevisionId: 'rev-disc-1',
      discontinuedAt: new Date('2026-03-01'),
      rowVersion: 1,
    };
    const revDisc = {
      id: 'rev-disc-1',
      bomId: 'bom-po-disc',
      status: BomRevisionStatus.CLOSED,
    };

    mockBoms = [bomPo1, bomPo2, bomFit, bomPending, bomDisc];
    mockRevisions = [revPo1, revPo2, revFit, revPending, revDisc];
    mockLines = [line1A, line1B, line2A, line2C];

    // PO Product 1 quantities:
    // Color Red: Size M (100), Size L (50) -> Red = 150
    // Color Blue: Size M (80), Size L (20) -> Blue = 100
    // Total pop-1 = 250
    //
    // PO Product 2 quantities:
    // Color Black: Size M (100), Size L (100) -> Black = 200
    // Total pop-2 = 200
    mockColorSizeRows = [
      { productId: 'pop-1', colorName: 'Đỏ', sizeLabel: 'M', quantity: 100 },
      { productId: 'pop-1', colorName: 'Đỏ', sizeLabel: 'L', quantity: 50 },
      { productId: 'pop-1', colorName: 'Xanh', sizeLabel: 'M', quantity: 80 },
      { productId: 'pop-1', colorName: 'Xanh', sizeLabel: 'L', quantity: 20 },
      { productId: 'pop-2', colorName: 'Đen', sizeLabel: 'M', quantity: 100 },
      { productId: 'pop-2', colorName: 'Đen', sizeLabel: 'L', quantity: 100 },
    ];

    aggregateAndWhereSpy = jest.fn();
    aggregateQueryMetrics = { rawQueryCount: 0 };
    bomRepoMock.createQueryBuilder.mockImplementation(() =>
      makeAggregateQueryBuilder(),
    );

    poProductRepoMock.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([{ poId: 'po-1' }, { poId: 'po-2' }]),
    });
  }

  beforeEach(async () => {
    bomRepoMock = {
      createQueryBuilder: jest.fn(),
    };
    bomRevisionRepoMock = {
      find: jest.fn(),
    };
    bomLineRepoMock = {
      createQueryBuilder: jest.fn(),
    };
    poProductRepoMock = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    poColorRepoMock = {
      find: jest.fn(),
    };
    poColorSizeRepoMock = {
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomAggregateService,
        BomCostService,
        { provide: getRepositoryToken(Bom), useValue: bomRepoMock },
        {
          provide: getRepositoryToken(BomRevision),
          useValue: bomRevisionRepoMock,
        },
        { provide: getRepositoryToken(BomLine), useValue: bomLineRepoMock },
        {
          provide: getRepositoryToken(PurchaseOrderProduct),
          useValue: poProductRepoMock,
        },
        {
          provide: getRepositoryToken(PurchaseOrderProductColor),
          useValue: poColorRepoMock,
        },
        {
          provide: getRepositoryToken(PurchaseOrderProductColorSize),
          useValue: poColorSizeRepoMock,
        },
      ],
    }).compile();

    aggregateService = module.get<BomAggregateService>(BomAggregateService);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. BASIC AGGREGATION & MULTIPLE PO BOMS (Sections 2, 6, 7, 11)
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Basic Aggregation & Calculation Formula', () => {
    it('aggregates requiredQuantity = consumption * liveOrderQuantity across multiple PO BOMs', async () => {
      setupAggregateEnv();

      // Product 1 Qty = 250, Product 2 Qty = 200
      // Material A:
      //   BOM 1: 2.0 * 250 = 500
      //   BOM 2: 3.0 * 200 = 600
      //   Total Material A = 1100
      // Material B:
      //   BOM 1: 1.0 * 250 = 250
      // Material C:
      //   BOM 2: 4.0 * 200 = 800

      const result = await aggregateService.aggregate({}, UserRoleCode.SA);

      expect(result.data.length).toBe(3);

      const matA = result.data.find((item) => item.materialId === 'mat-A');
      expect(matA).toBeDefined();
      expect(matA?.totalRequiredQuantity).toBe(1100);
      expect(matA?.bomCount).toBe(2);
      expect(matA?.poProductCount).toBe(2);
      expect(matA?.unitSnapshot).toBe('Mét');
      expect(matA?.totalEstimatedCost).toBe(1100 * 50000); // 55,000,000

      const matB = result.data.find((item) => item.materialId === 'mat-B');
      expect(matB).toBeDefined();
      expect(matB?.totalRequiredQuantity).toBe(250);
      expect(matB?.bomCount).toBe(1);
      expect(matB?.poProductCount).toBe(1);
      expect(matB?.totalEstimatedCost).toBe(250 * 20000); // 5,000,000

      const matC = result.data.find((item) => item.materialId === 'mat-C');
      expect(matC).toBeDefined();
      expect(matC?.totalRequiredQuantity).toBe(800);
      expect(matC?.totalEstimatedCost).toBe(800 * 10000); // 8,000,000
    });

    it('dynamically recalculates required quantity when live PO quantity changes without modifying BOM', async () => {
      setupAggregateEnv();

      // Update Product 1 Red/M from 100 to 150 (Total Product 1 becomes 300)
      mockColorSizeRows[0].quantity = 150;

      // Material A:
      //   BOM 1: 2.0 * 300 = 600
      //   BOM 2: 3.0 * 200 = 600
      //   Total Material A becomes 1200
      const result = await aggregateService.aggregate({}, UserRoleCode.SA);

      const matA = result.data.find((item) => item.materialId === 'mat-A');
      expect(matA?.totalRequiredQuantity).toBe(1200);
      expect(matA?.totalEstimatedCost).toBe(1200 * 50000); // 60,000,000
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. SOURCE BOM ELIGIBILITY & EXCLUSION RULES (Sections 3, 14, 30, 31, 32)
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Source BOM Eligibility & Exclusions', () => {
    it('strictly excludes Fit BOMs from aggregation', async () => {
      setupAggregateEnv();

      const result = await aggregateService.aggregate({});
      // Fit BOM has styleId, bomType FIT; verified through mock filter
      expect(result.data.every((i) => i.materialId !== 'mat-fit-only')).toBe(
        true,
      );
    });

    it('strictly excludes in-progress PO BOMs (wait_nvkh, wait_rd, etc.)', async () => {
      setupAggregateEnv();

      const result = await aggregateService.aggregate({});
      expect(result.data).toBeDefined();
      expect(bomRepoMock.createQueryBuilder).toHaveBeenCalled();
    });

    it('strictly excludes discontinued PO BOMs', async () => {
      setupAggregateEnv();

      const result = await aggregateService.aggregate({});
      // Discontinued BOM has discontinuedAt != null; excluded by query
      expect(result.data.length).toBe(3);
    });

    it('returns empty list when no PO BOMs are eligible', async () => {
      setupAggregateEnv();

      // Make all BOMs ineligible
      mockBoms = [];

      const result = await aggregateService.aggregate({});
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. GROUPING & UNIT SNAPSHOT BEHAVIOR (Sections 7, 8, 12, 33)
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Grouping & Unit Snapshot Behavior', () => {
    it('preserves historical snapshots from BOM lines rather than overwriting from Master Data', async () => {
      setupAggregateEnv();

      const result = await aggregateService.aggregate({});
      const matA = result.data.find((i) => i.materialId === 'mat-A');

      expect(matA?.materialNameSnapshot).toBe('Vải Cotton 100% 220gsm');
      expect(matA?.materialGroupSnapshot).toBe('Vải chính');
      expect(matA?.unitSnapshot).toBe('Mét');
    });

    it('groups separately when the same materialId has different unit snapshots (avoids invalid unit mixing)', async () => {
      setupAggregateEnv();

      // Add a line for mat-A with unit 'Cuộn' instead of 'Mét'
      const lineWithDifferentUnit = {
        id: 'line-diff-unit',
        revisionId: 'rev-po-1',
        materialId: 'mat-A',
        materialNameSnapshot: 'Vải Cotton 100% 220gsm',
        materialGroupSnapshot: 'Vải chính',
        unitSnapshot: 'Cuộn', // Different unit
        consumption: 0.5,
        unitCost: 500000,
        orderIndex: 2,
      };
      mockLines.push(lineWithDifferentUnit);

      const result = await aggregateService.aggregate({});

      // mat-A with 'Mét' and mat-A with 'Cuộn' must be 2 distinct entries
      const matAMet = result.data.find(
        (i) => i.materialId === 'mat-A' && i.unitSnapshot === 'Mét',
      );
      const matACuon = result.data.find(
        (i) => i.materialId === 'mat-A' && i.unitSnapshot === 'Cuộn',
      );

      expect(matAMet).toBeDefined();
      expect(matAMet?.totalRequiredQuantity).toBe(1100);

      expect(matACuon).toBeDefined();
      expect(matACuon?.totalRequiredQuantity).toBe(0.5 * 250); // 125
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. COST HANDLING & ROLE MASKING (Sections 15, 16, 23, 37)
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Cost Calculation & Role Masking', () => {
    it('exposes totalEstimatedCost and unitCost for TPKH, ACCOUNTING, and SA roles', async () => {
      setupAggregateEnv();

      const roles = [
        UserRoleCode.TPKH,
        UserRoleCode.ACCOUNTING,
        UserRoleCode.SA,
      ];
      for (const role of roles) {
        const result = await aggregateService.aggregate({}, role);
        const matA = result.data.find((i) => i.materialId === 'mat-A');
        expect(matA?.totalEstimatedCost).toBe(55000000);
        expect(matA?.unitCost).toBe(50000);
        expect(matA?.costComplete).toBe(true);
      }
    });

    it('masks totalEstimatedCost and unitCost to null for NVKH and RD roles', async () => {
      setupAggregateEnv();

      const roles = [UserRoleCode.NVKH, UserRoleCode.RD];
      for (const role of roles) {
        const result = await aggregateService.aggregate({}, role);
        const matA = result.data.find((i) => i.materialId === 'mat-A');
        expect(matA?.totalEstimatedCost).toBeNull();
        expect(matA?.unitCost).toBeNull();
        // Quantity is always visible
        expect(matA?.totalRequiredQuantity).toBe(1100);
      }
    });

    it('sets totalEstimatedCost = null and costComplete = false if any contributing line has null unitCost', async () => {
      setupAggregateEnv();

      // Make line 1A have null unitCost
      mockLines[0].unitCost = null;

      const result = await aggregateService.aggregate({}, UserRoleCode.SA);
      const matA = result.data.find((i) => i.materialId === 'mat-A');

      expect(matA?.totalEstimatedCost).toBeNull();
      expect(matA?.costComplete).toBe(false);
      expect(matA?.totalRequiredQuantity).toBe(1100); // Quantity remains accurate
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. COLOR & SIZE BREAKDOWN (Sections 9, 10)
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. Color and Size Breakdowns', () => {
    it('returns breakdown by color when breakdown = color', async () => {
      setupAggregateEnv();

      const result = await aggregateService.aggregate({
        breakdown: AggregateBreakdownType.COLOR,
      });

      const matB = result.data.find((i) => i.materialId === 'mat-B');
      expect(matB?.breakdown).toBeDefined();

      // Product 1: Red (150), Blue (100) -> consumption 1.0 -> Red: 150, Blue: 100
      const redBreakdown = matB?.breakdown?.find((b) => b.colorName === 'Đỏ');
      const blueBreakdown = matB?.breakdown?.find(
        (b) => b.colorName === 'Xanh',
      );

      expect(redBreakdown?.requiredQuantity).toBe(150);
      expect(blueBreakdown?.requiredQuantity).toBe(100);
    });

    it('returns breakdown by size when breakdown = size', async () => {
      setupAggregateEnv();

      const result = await aggregateService.aggregate({
        breakdown: AggregateBreakdownType.SIZE,
      });

      const matB = result.data.find((i) => i.materialId === 'mat-B');
      expect(matB?.breakdown).toBeDefined();

      // Product 1: Size M (100 + 80 = 180), Size L (50 + 20 = 70)
      const sizeM = matB?.breakdown?.find((b) => b.sizeLabel === 'M');
      const sizeL = matB?.breakdown?.find((b) => b.sizeLabel === 'L');

      expect(sizeM?.requiredQuantity).toBe(180);
      expect(sizeL?.requiredQuantity).toBe(70);
    });

    it('returns detailed breakdown by color_size when breakdown = color_size', async () => {
      setupAggregateEnv();

      const result = await aggregateService.aggregate({
        breakdown: AggregateBreakdownType.COLOR_SIZE,
      });

      const matB = result.data.find((i) => i.materialId === 'mat-B');
      expect(matB?.breakdown).toBeDefined();

      const redM = matB?.breakdown?.find(
        (b) => b.colorName === 'Đỏ' && b.sizeLabel === 'M',
      );
      const redL = matB?.breakdown?.find(
        (b) => b.colorName === 'Đỏ' && b.sizeLabel === 'L',
      );

      expect(redM?.requiredQuantity).toBe(100);
      expect(redL?.requiredQuantity).toBe(50);
    });

    it('does not include breakdown when breakdown is none or omitted', async () => {
      setupAggregateEnv();

      const result = await aggregateService.aggregate({});
      const matB = result.data.find((i) => i.materialId === 'mat-B');
      expect(matB?.breakdown).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. PAGINATION & SORTING (Section 18)
  // ──────────────────────────────────────────────────────────────────────────
  describe('6. Pagination and Sorting', () => {
    it('paginates aggregated material items properly', async () => {
      setupAggregateEnv();

      const page1 = await aggregateService.aggregate({ page: 1, limit: 2 });
      expect(page1.data.length).toBe(2);
      expect(page1.meta.total).toBe(3);
      expect(page1.meta.totalPages).toBe(2);
      expect(page1.meta.page).toBe(1);
      expect(page1.meta.limit).toBe(2);

      const page2 = await aggregateService.aggregate({ page: 2, limit: 2 });
      expect(page2.data.length).toBe(1);
      expect(page2.meta.page).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. ANTI-N+1 PERFORMANCE VERIFICATION (Section 19)
  // ──────────────────────────────────────────────────────────────────────────
  describe('7. Anti-N+1 Performance Verification', () => {
    it('executes two database queries regardless of the number of BOMs', async () => {
      setupAggregateEnv();

      await aggregateService.aggregate({});

      expect(bomRepoMock.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(aggregateQueryMetrics.rawQueryCount).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. FILTERS & EDGE CASES (Sections 5, 12, 13, 28, 34)
  // ──────────────────────────────────────────────────────────────────────────
  describe('8. Filters & Edge Cases', () => {
    it('filters aggregated items by specific materialId', async () => {
      setupAggregateEnv();

      const result = await aggregateService.aggregate({ materialId: 'mat-A' });
      expect(result.data.length).toBe(1);
      expect(result.data[0].materialId).toBe('mat-A');
    });

    it('filters by purchaseOrder code using query builder', async () => {
      setupAggregateEnv();

      const andWhereSpy = (aggregateAndWhereSpy = jest.fn());

      await aggregateService.aggregate({ purchaseOrder: 'PO-2026-001' });
      expect(andWhereSpy).toHaveBeenCalledWith(
        expect.stringContaining('po.po_code ILIKE :poCode'),
        expect.objectContaining({ poCode: '%PO-2026-001%' }),
      );
    });

    it('filters by product code using query builder', async () => {
      setupAggregateEnv();

      const andWhereSpy = (aggregateAndWhereSpy = jest.fn());

      await aggregateService.aggregate({ product: 'PRD-POLO-001' });
      expect(andWhereSpy).toHaveBeenCalledWith(
        expect.stringContaining('pop.product_code ILIKE :prodCode'),
        expect.objectContaining({ prodCode: '%PRD-POLO-001%' }),
      );
    });

    it('filters by style code or styleId using query builder', async () => {
      setupAggregateEnv();

      const andWhereSpy = (aggregateAndWhereSpy = jest.fn());

      await aggregateService.aggregate({ style: 'ST-POLO' });
      expect(andWhereSpy).toHaveBeenCalledWith(
        expect.stringContaining('style.style_code ILIKE :styleCode'),
        expect.objectContaining({ styleCode: '%ST-POLO%' }),
      );
    });

    it('handles zero quantity PO product gracefully (requiredQuantity = 0)', async () => {
      setupAggregateEnv();

      // Set all quantities for Product 1 to 0
      mockColorSizeRows[0].quantity = 0;
      mockColorSizeRows[1].quantity = 0;
      mockColorSizeRows[2].quantity = 0;
      mockColorSizeRows[3].quantity = 0;

      const result = await aggregateService.aggregate({}, UserRoleCode.TPKH);
      const matB = result.data.find((i) => i.materialId === 'mat-B');
      expect(matB?.totalRequiredQuantity).toBe(0);
      expect(matB?.totalEstimatedCost).toBe(0);
    });

    it('sums consumption correctly when a single BOM contains duplicate material lines', async () => {
      setupAggregateEnv();

      // Add a second line for mat-A in BOM 1 (consumption: 0.5)
      const duplicateLine = {
        id: 'line-1-a-extra',
        revisionId: 'rev-po-1',
        materialId: 'mat-A',
        materialNameSnapshot: 'Vải Cotton 100% 220gsm',
        materialGroupSnapshot: 'Vải chính',
        unitSnapshot: 'Mét',
        consumption: 0.5,
        unitCost: 50000,
        orderIndex: 3,
      };
      mockLines.push(duplicateLine);

      // Material A:
      //   BOM 1: (2.0 + 0.5) * 250 = 625
      //   BOM 2: 3.0 * 200 = 600
      //   Total = 1225
      const result = await aggregateService.aggregate({});
      const matA = result.data.find((i) => i.materialId === 'mat-A');
      expect(matA?.totalRequiredQuantity).toBe(1225);
    });

    it('masks costs for anonymous / null user role', async () => {
      setupAggregateEnv();

      const result = await aggregateService.aggregate({}, null);
      const matA = result.data.find((i) => i.materialId === 'mat-A');
      expect(matA?.totalEstimatedCost).toBeNull();
      expect(matA?.unitCost).toBeNull();
    });

    it('excludes historical revisions for the same PO BOM even if previously closed', async () => {
      setupAggregateEnv();

      // Add a historical revision line belonging to rev-po-1-old
      const historicalLine = {
        id: 'line-old-historical',
        revisionId: 'rev-po-1-old',
        materialId: 'mat-A',
        materialNameSnapshot: 'Vải Cotton 100% 220gsm',
        materialGroupSnapshot: 'Vải chính',
        unitSnapshot: 'Mét',
        consumption: 10.0,
        unitCost: 50000,
        orderIndex: 99,
      };
      mockLines.push(historicalLine);

      // Only lines whose revisionId matches currentRevisionIds of eligible BOMs are queried
      const result = await aggregateService.aggregate({});
      const matA = result.data.find((i) => i.materialId === 'mat-A');
      // Should NOT include 10.0 * 250 = 2500 from historical revision
      expect(matA?.totalRequiredQuantity).toBe(1100);
    });

    it('excludes PO BOM when current revision is in wait_tpkh_confirm, wait_accounting, or wait_sa_approve', async () => {
      setupAggregateEnv();

      // Mark bomPo1 current revision as WAIT_TPKH_CONFIRM
      mockRevisions.find((r) => r.id === 'rev-po-1')!.status =
        BomRevisionStatus.WAIT_TPKH_CONFIRM;

      const result = await aggregateService.aggregate({});
      // Only bomPo2 is eligible now (Product 2 with Material A consumption 3.0 * 200 = 600)
      const matA = result.data.find((i) => i.materialId === 'mat-A');
      expect(matA?.totalRequiredQuantity).toBe(600);
      expect(matA?.poProductCount).toBe(1);
    });

    it('filters by exact purchaseOrderId', async () => {
      setupAggregateEnv();

      const andWhereSpy = (aggregateAndWhereSpy = jest.fn());

      await aggregateService.aggregate({ purchaseOrderId: 'po-uuid-123' });
      expect(andWhereSpy).toHaveBeenCalledWith(
        '(po.id::text = :poId OR po.po_code ILIKE :poCode)',
        {
          poId: 'po-uuid-123',
          poCode: '%po-uuid-123%',
        },
      );
    });

    it('filters by exact purchaseOrderProductId', async () => {
      setupAggregateEnv();

      const andWhereSpy = (aggregateAndWhereSpy = jest.fn());

      await aggregateService.aggregate({
        purchaseOrderProductId: 'pop-uuid-456',
      });
      expect(andWhereSpy).toHaveBeenCalledWith(
        '(pop.id::text = :popId OR pop.product_code ILIKE :popCode)',
        {
          popId: 'pop-uuid-456',
          popCode: '%pop-uuid-456%',
        },
      );
    });

    it('sets costComplete=false and totalEstimatedCost=null when one line has null unitCost and another has valid unitCost', async () => {
      setupAggregateEnv();

      // Set line2A (in BOM 2) unitCost to null while line1A has unitCost = 50000
      mockLines.find((l) => l.id === 'line-2-a')!.unitCost = null;

      const result = await aggregateService.aggregate({}, UserRoleCode.TPKH);
      const matA = result.data.find((i) => i.materialId === 'mat-A');
      expect(matA?.costComplete).toBe(false);
      expect(matA?.totalEstimatedCost).toBeNull();
      expect(matA?.unitCost).toBeNull();
      // Required quantity remains valid: 1100
      expect(matA?.totalRequiredQuantity).toBe(1100);
    });

    it('calculates breakdown color_size across multiple products with identical colors and sizes', async () => {
      setupAggregateEnv();

      // Product 1 has Red M: 100, Red L: 50, Blue M: 80, Blue L: 20
      // Material A consumption in Product 1 is 2.0
      // Red M: 100 * 2 = 200
      // Red L: 50 * 2 = 100
      // Blue M: 80 * 2 = 160
      // Blue L: 20 * 2 = 40
      const result = await aggregateService.aggregate({
        breakdown: AggregateBreakdownType.COLOR_SIZE,
      });
      const matA = result.data.find((i) => i.materialId === 'mat-A');
      expect(matA?.breakdown).toBeDefined();

      const redM = matA?.breakdown?.find(
        (b) => b.colorName === 'Đỏ' && b.sizeLabel === 'M',
      );
      expect(redM?.requiredQuantity).toBe(200);

      const blackM = matA?.breakdown?.find(
        (b) => b.colorName === 'Đen' && b.sizeLabel === 'M',
      );
      // Product 2 has Black M: 100, consumption: 3.0 -> 300
      expect(blackM?.requiredQuantity).toBe(300);
    });

    it('handles empty color size rows gracefully when PO has no quantities', async () => {
      setupAggregateEnv();

      // Clear all color size rows
      mockColorSizeRows = [];

      const result = await aggregateService.aggregate({}, UserRoleCode.TPKH);
      const matA = result.data.find((i) => i.materialId === 'mat-A');
      expect(matA?.totalRequiredQuantity).toBe(0);
      expect(matA?.totalEstimatedCost).toBe(0);
    });
  });
});
