import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BomsService, normalizeBusinessDate } from '../boms.service';
import { BillOfMaterials } from '../entities/BillOfMaterials.entity';
import { BillOfMaterialLine } from '../entities/BillOfMaterialLine.entity';
import { BomRevision } from '../entities/BomRevision.entity';
import { FitBomLine } from '../../fit-boms/entities/FitBomLine.entity';
import { FitBomRevision } from '../../fit-boms/entities/FitBomRevision.entity';
import { Style } from '../../styles/entities/Style.entity';
import { RevisionStatus } from '../../../common/enums/database.enums';

describe('BOM Revision Resolution & Effective Date Rules', () => {
  let service: BomsService;

  // In-memory revisions dataset for PO BOM 'bom-1'
  let poRevisions: Array<{
    id: string;
    billOfMaterialId: string;
    revisionNo: number;
    status: RevisionStatus;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    changeReason?: string;
  }> = [];

  // In-memory revisions dataset for Fit BOM 'style-1'
  let fitRevisions: Array<{
    id: string;
    styleId: string;
    revisionNo: number;
    status: RevisionStatus;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    changeReason?: string;
  }> = [];

  const createMockQueryBuilder = (getDataset: () => any[]) => {
    return jest.fn().mockImplementation(() => {
      let bomIdFilter: string | null = null;
      let styleIdFilter: string | null = null;
      let statusFilter: string | null = null;
      let statusInFilter: string[] | null = null;
      let businessDateFilter: string | null = null;

      const builder: any = {
        where: jest
          .fn()
          .mockImplementation((condition: string, params: any) => {
            if (params?.bomId) bomIdFilter = params.bomId;
            if (params?.styleId) styleIdFilter = params.styleId;
            return builder;
          }),
        andWhere: jest
          .fn()
          .mockImplementation((condition: string, params: any) => {
            if (params?.status) statusFilter = params.status;
            if (params?.statuses) statusInFilter = params.statuses;
            if (params?.businessDate) businessDateFilter = params.businessDate;
            return builder;
          }),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockImplementation(async () => {
          let rows = [...getDataset()];

          if (bomIdFilter) {
            rows = rows.filter((r) => r.billOfMaterialId === bomIdFilter);
          }
          if (styleIdFilter) {
            rows = rows.filter((r) => r.styleId === styleIdFilter);
          }
          if (statusFilter) {
            rows = rows.filter((r) => r.status === statusFilter);
          }
          if (statusInFilter) {
            rows = rows.filter((r) => statusInFilter!.includes(r.status));
          }
          if (businessDateFilter) {
            rows = rows.filter((r) => {
              const fromOk =
                r.effectiveFrom === null ||
                r.effectiveFrom <= businessDateFilter!;
              const toOk =
                r.effectiveTo === null || businessDateFilter! < r.effectiveTo;
              return fromOk && toOk;
            });
          }

          rows.sort((a, b) => b.revisionNo - a.revisionNo);
          return rows.length > 0 ? { ...rows[0] } : null;
        }),
      };
      return builder;
    });
  };

  const bomRepoMock = {
    findOne: jest.fn().mockImplementation(async ({ where }: any) => {
      if (where?.id === 'bom-1') {
        return {
          id: 'bom-1',
          poCodeSnapshot: 'PO-2026-001',
          status: 'closed',
        };
      }
      return null;
    }),
  };

  const styleRepoMock = {
    findOne: jest.fn().mockImplementation(async ({ where }: any) => {
      if (where?.id === 'style-1') {
        return {
          id: 'style-1',
          styleCode: 'STY-FIT-001',
          styleName: 'Polo Shirt',
          status: 'active',
          createdAt: new Date('2026-01-01'),
        };
      }
      return null;
    }),
  };

  const bomLineRepoMock = {
    find: jest
      .fn()
      .mockResolvedValue([
        { id: 'line-1', consumptionPerUnit: 2, unitCost: 15000, orderIndex: 1 },
      ]),
  };

  const fitBomLineRepoMock = {
    find: jest
      .fn()
      .mockResolvedValue([
        { id: 'fit-line-1', consumption: 1.2, orderIndex: 1 },
      ]),
  };

  const bomRevisionRepoMock = {
    findOne: jest.fn().mockImplementation(async ({ where }: any) => {
      const rows = poRevisions.filter((r) => {
        if (where.id && r.id !== where.id) return false;
        if (
          where.billOfMaterialId &&
          r.billOfMaterialId !== where.billOfMaterialId
        )
          return false;
        if (where.revisionNo && r.revisionNo !== where.revisionNo) return false;
        return true;
      });
      return rows[0] ? { ...rows[0] } : null;
    }),
    createQueryBuilder: createMockQueryBuilder(() => poRevisions),
  };

  const fitBomRevisionRepoMock = {
    findOne: jest.fn().mockImplementation(async ({ where }: any) => {
      const rows = fitRevisions.filter((r) => {
        if (where.id && r.id !== where.id) return false;
        if (where.styleId && r.styleId !== where.styleId) return false;
        if (where.revisionNo && r.revisionNo !== where.revisionNo) return false;
        return true;
      });
      return rows[0] ? { ...rows[0] } : null;
    }),
    createQueryBuilder: createMockQueryBuilder(() => fitRevisions),
  };

  const dataSourceMock = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    // Reset dataset according to user specification:
    // Rev 1: approved, [NULL, 2026-03-01)
    // Rev 2: approved, [2026-03-01, NULL)
    // Rev 3: draft overlap, [2026-02-01, NULL)
    poRevisions = [
      {
        id: 'rev-1',
        billOfMaterialId: 'bom-1',
        revisionNo: 1,
        status: RevisionStatus.APPROVED,
        effectiveFrom: null,
        effectiveTo: '2026-03-01',
      },
      {
        id: 'rev-2',
        billOfMaterialId: 'bom-1',
        revisionNo: 2,
        status: RevisionStatus.APPROVED,
        effectiveFrom: '2026-03-01',
        effectiveTo: null,
      },
      {
        id: 'rev-3',
        billOfMaterialId: 'bom-1',
        revisionNo: 3,
        status: RevisionStatus.DRAFT,
        effectiveFrom: '2026-02-01',
        effectiveTo: null,
      },
    ];

    fitRevisions = [
      {
        id: 'fit-rev-1',
        styleId: 'style-1',
        revisionNo: 1,
        status: RevisionStatus.APPROVED,
        effectiveFrom: null,
        effectiveTo: '2026-03-01',
      },
      {
        id: 'fit-rev-2',
        styleId: 'style-1',
        revisionNo: 2,
        status: RevisionStatus.APPROVED,
        effectiveFrom: '2026-03-01',
        effectiveTo: null,
      },
      {
        id: 'fit-rev-3',
        styleId: 'style-1',
        revisionNo: 3,
        status: RevisionStatus.DRAFT,
        effectiveFrom: '2026-02-01',
        effectiveTo: null,
      },
    ];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomsService,
        { provide: getRepositoryToken(BillOfMaterials), useValue: bomRepoMock },
        {
          provide: getRepositoryToken(BillOfMaterialLine),
          useValue: bomLineRepoMock,
        },
        {
          provide: getRepositoryToken(BomRevision),
          useValue: bomRevisionRepoMock,
        },
        {
          provide: getRepositoryToken(FitBomLine),
          useValue: fitBomLineRepoMock,
        },
        {
          provide: getRepositoryToken(FitBomRevision),
          useValue: fitBomRevisionRepoMock,
        },
        { provide: getRepositoryToken(Style), useValue: styleRepoMock },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get<BomsService>(BomsService);
  });

  describe('normalizeBusinessDate', () => {
    it('normalizes YYYY-MM-DD strings directly', () => {
      expect(normalizeBusinessDate('2026-03-01')).toBe('2026-03-01');
      expect(normalizeBusinessDate('2026-02-15T15:30:00.000Z')).toBe(
        '2026-02-15',
      );
    });

    it('normalizes Date instances to YYYY-MM-DD local calendar date', () => {
      const date = new Date(2026, 1, 15); // Feb 15, 2026
      expect(normalizeBusinessDate(date)).toBe('2026-02-15');
    });

    it('defaults to today when omitted', () => {
      const today = normalizeBusinessDate();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('User Required Scenarios: Rev 1 [NULL, 2026-03-01) vs Rev 2 [2026-03-01, NULL)', () => {
    it('2026-02-15 -> returns Rev 1', async () => {
      const activePoRev = await service.getActivePoBomRevision(
        'bom-1',
        '2026-02-15',
      );
      expect(activePoRev).toBeDefined();
      expect(activePoRev?.id).toBe('rev-1');
      expect(activePoRev?.revisionNo).toBe(1);

      const activeFitRev = await service.getActiveFitBomRevision(
        'style-1',
        '2026-02-15',
      );
      expect(activeFitRev).toBeDefined();
      expect(activeFitRev?.id).toBe('fit-rev-1');
      expect(activeFitRev?.revisionNo).toBe(1);
    });

    it('2026-03-01 -> returns Rev 2 (inclusive lower bound [2026-03-01, NULL))', async () => {
      const activePoRev = await service.getActivePoBomRevision(
        'bom-1',
        '2026-03-01',
      );
      expect(activePoRev).toBeDefined();
      expect(activePoRev?.id).toBe('rev-2');
      expect(activePoRev?.revisionNo).toBe(2);

      const activeFitRev = await service.getActiveFitBomRevision(
        'style-1',
        '2026-03-01',
      );
      expect(activeFitRev).toBeDefined();
      expect(activeFitRev?.id).toBe('fit-rev-2');
      expect(activeFitRev?.revisionNo).toBe(2);
    });

    it('Active resolver -> NEVER returns Rev 3 (draft) despite overlap date range', async () => {
      // Date where Rev 3 draft claims effectiveFrom: '2026-02-01'
      const activePoRev = await service.getActivePoBomRevision(
        'bom-1',
        '2026-02-10',
      );
      expect(activePoRev).toBeDefined();
      expect(activePoRev?.id).toBe('rev-1'); // Rev 1 is returned because Rev 3 is draft
      expect(activePoRev?.status).toBe(RevisionStatus.APPROVED);

      const activeFitRev = await service.getActiveFitBomRevision(
        'style-1',
        '2026-02-10',
      );
      expect(activeFitRev?.id).toBe('fit-rev-1');
      expect(activeFitRev?.status).toBe(RevisionStatus.APPROVED);
    });

    it('Specific revision resolver -> CAN return Rev 3 (draft) for UI inspection/editing', async () => {
      const rev3 = await service.getBomRevisionById('bom-1', 'rev-3');
      expect(rev3).toBeDefined();
      expect(rev3?.id).toBe('rev-3');
      expect(rev3?.status).toBe(RevisionStatus.DRAFT);
      expect(rev3?.revisionNo).toBe(3);

      const fitRev3 = await service.getFitBomRevisionById(
        'style-1',
        'fit-rev-3',
      );
      expect(fitRev3).toBeDefined();
      expect(fitRev3?.id).toBe('fit-rev-3');
      expect(fitRev3?.status).toBe(RevisionStatus.DRAFT);
    });

    it('Specific revision resolver -> validates revision ownership (returns null if mismatch)', async () => {
      const wrongBom = await service.getBomRevisionById('bom-other', 'rev-3');
      expect(wrongBom).toBeNull();

      const wrongStyle = await service.getFitBomRevisionById(
        'style-other',
        'fit-rev-3',
      );
      expect(wrongStyle).toBeNull();
    });

    it('getLatestEditableRevision -> returns Rev 3 (draft) for data entry screens', async () => {
      const editablePo = await service.getLatestEditablePoBomRevision('bom-1');
      expect(editablePo).toBeDefined();
      expect(editablePo?.id).toBe('rev-3');
      expect(editablePo?.status).toBe(RevisionStatus.DRAFT);

      const editableFit =
        await service.getLatestEditableFitBomRevision('style-1');
      expect(editableFit).toBeDefined();
      expect(editableFit?.id).toBe('fit-rev-3');
      expect(editableFit?.status).toBe(RevisionStatus.DRAFT);
    });

    it('When no approved revision exists -> Active resolver returns null (NO silent draft fallback)', async () => {
      // Remove all approved revisions, leaving only Rev 3 (draft)
      poRevisions = poRevisions.filter(
        (r) => r.status !== RevisionStatus.APPROVED,
      );
      fitRevisions = fitRevisions.filter(
        (r) => r.status !== RevisionStatus.APPROVED,
      );

      const activePoRev = await service.getActivePoBomRevision(
        'bom-1',
        '2026-02-15',
      );
      expect(activePoRev).toBeNull();

      const activeFitRev = await service.getActiveFitBomRevision(
        'style-1',
        '2026-02-15',
      );
      expect(activeFitRev).toBeNull();
    });
  });

  describe('Legacy Baseline [NULL, NULL) Rule', () => {
    it('Legacy baseline revision with [NULL, NULL) is active on any date until superseded', async () => {
      poRevisions = [
        {
          id: 'legacy-rev',
          billOfMaterialId: 'bom-1',
          revisionNo: 1,
          status: RevisionStatus.APPROVED,
          effectiveFrom: null,
          effectiveTo: null,
        },
      ];

      const pastRev = await service.getActivePoBomRevision(
        'bom-1',
        '2020-01-01',
      );
      expect(pastRev?.id).toBe('legacy-rev');

      const presentRev = await service.getActivePoBomRevision(
        'bom-1',
        '2026-09-13',
      );
      expect(presentRev?.id).toBe('legacy-rev');

      const futureRev = await service.getActivePoBomRevision(
        'bom-1',
        '2030-12-31',
      );
      expect(futureRev?.id).toBe('legacy-rev');
    });
  });

  describe('findOne detail resolution', () => {
    it('defaults to Active Approved Revision for given targetDate', async () => {
      const result = await service.findOne(
        'bom-1',
        { roleCode: 'TPKH' },
        { targetDate: '2026-02-15' },
      );

      expect(result.objectType).toBe('po');
      expect(result.revision).toBeDefined();
      expect(result.revision?.id).toBe('rev-1');
      expect(result.revision?.revisionNo).toBe(1);
      expect(result.bomLines).toHaveLength(1);
      expect(result.totalCostPerUnit).toBe(30000);
    });

    it('returns null revision when BOM has no active approved revision for the date', async () => {
      poRevisions = poRevisions.filter(
        (r) => r.status !== RevisionStatus.APPROVED,
      );

      const result = await service.findOne(
        'bom-1',
        { roleCode: 'TPKH' },
        { targetDate: '2026-02-15' },
      );

      expect(result.revision).toBeNull();
      expect(result.bomLines).toHaveLength(0);
      expect(result.totalCostPerUnit).toBeNull();
    });

    it('allows querying specific revision by revisionId (even draft)', async () => {
      const result = await service.findOne(
        'bom-1',
        { roleCode: 'TPKH' },
        { revisionId: 'rev-3' },
      );

      expect(result.revision).toBeDefined();
      expect(result.revision?.id).toBe('rev-3');
      expect(result.revision?.status).toBe(RevisionStatus.DRAFT);
    });

    it('allows querying latest editable revision via editable: true', async () => {
      const result = await service.findOne(
        'bom-1',
        { roleCode: 'TPKH' },
        { editable: true },
      );

      expect(result.revision).toBeDefined();
      expect(result.revision?.id).toBe('rev-3');
      expect(result.revision?.status).toBe(RevisionStatus.DRAFT);
      expect(result.revision?.isEditable).toBe(true);
    });
  });
});
