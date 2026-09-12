import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { BomsService, assertRevisionEditable } from '../boms.service';
import { BillOfMaterials } from '../entities/BillOfMaterials.entity';
import { BillOfMaterialLine } from '../entities/BillOfMaterialLine.entity';
import { BomRevision } from '../entities/BomRevision.entity';
import { FitBomLine } from '../../fit-boms/entities/FitBomLine.entity';
import { FitBomRevision } from '../../fit-boms/entities/FitBomRevision.entity';
import { Style } from '../../styles/entities/Style.entity';
import { RevisionStatus } from '../../../common/enums/database.enums';

describe('Tier 2C — Revision Lifecycle & Approval Workflow', () => {
  let service: BomsService;

  // In-memory DB stores
  let poBoms: any[] = [];
  let poRevisions: any[] = [];
  let poLines: any[] = [];

  let styles: any[] = [];
  let fitRevisions: any[] = [];
  let fitLines: any[] = [];

  const currentUser = { id: 'user-1', roleCode: 'TPKH' };
  const nvkhUser = { id: 'user-2', roleCode: 'NVKH' };

  beforeEach(async () => {
    poBoms = [
      {
        id: 'bom-1',
        bomCode: 'BOM-001',
        poCodeSnapshot: 'PO-100',
        productCodeSnapshot: 'STY-001',
        status: 'closed',
      },
    ];

    poRevisions = [
      {
        id: 'rev-1',
        billOfMaterialId: 'bom-1',
        revisionNo: 1,
        status: RevisionStatus.APPROVED,
        effectiveFrom: null,
        effectiveTo: null,
        changeReason: 'Baseline legacy',
        createdBy: 'admin',
        rowVersion: 1,
      },
    ];

    poLines = [
      {
        id: 'line-1',
        revisionId: 'rev-1',
        materialNameSnapshot: 'Cotton 100%',
        materialGroupSnapshot: 'Vải chính',
        unitSnapshot: 'Mét',
        consumptionPerUnit: 1.5,
        unitCost: 50000,
        orderIndex: 1,
      },
    ];

    styles = [
      {
        id: 'style-1',
        styleCode: 'STY-FIT-01',
        styleName: 'Fit Polo',
        status: 'active',
      },
    ];

    fitRevisions = [
      {
        id: 'fit-rev-1',
        styleId: 'style-1',
        revisionNo: 1,
        status: RevisionStatus.APPROVED,
        effectiveFrom: null,
        effectiveTo: null,
        changeReason: 'Baseline fit',
        createdBy: 'admin',
        rowVersion: 1,
      },
    ];

    fitLines = [
      {
        id: 'fit-line-1',
        revisionId: 'fit-rev-1',
        materialNameSnapshot: 'Chỉ may',
        materialGroupSnapshot: 'Phụ liệu',
        unitSnapshot: 'Cuộn',
        consumption: 0.1,
        wastePercent: 5,
        orderIndex: 1,
      },
    ];

    // Helper queryRunner mock
    const createQueryRunnerMock = () => {
      const qr: any = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        manager: {
          query: jest
            .fn()
            .mockImplementation(async (sql: string, params: any[]) => {
              if (sql.includes('MAX(revision_no)')) {
                if (sql.includes('bom_revisions')) {
                  const bId = params[0];
                  const revs = poRevisions.filter(
                    (r) => r.billOfMaterialId === bId,
                  );
                  const maxNo =
                    revs.length > 0
                      ? Math.max(...revs.map((r) => r.revisionNo))
                      : 0;
                  return [{ max_no: maxNo }];
                } else {
                  const sId = params[0];
                  const revs = fitRevisions.filter((r) => r.styleId === sId);
                  const maxNo =
                    revs.length > 0
                      ? Math.max(...revs.map((r) => r.revisionNo))
                      : 0;
                  return [{ max_no: maxNo }];
                }
              }
              return [];
            }),
          create: jest
            .fn()
            .mockImplementation((entityClass: any, data: any) => ({
              id:
                data.id || `gen-${Math.random().toString(36).substring(2, 9)}`,
              ...data,
            })),
          save: jest
            .fn()
            .mockImplementation(async (entityClass: any, entity: any) => {
              if (Array.isArray(entity)) {
                for (const item of entity) {
                  if (item.consumptionPerUnit !== undefined) {
                    const idx = poLines.findIndex((l) => l.id === item.id);
                    if (idx >= 0) poLines[idx] = item;
                    else poLines.push(item);
                  } else {
                    const idx = fitLines.findIndex((l) => l.id === item.id);
                    if (idx >= 0) fitLines[idx] = item;
                    else fitLines.push(item);
                  }
                }
                return entity;
              }

              if (entityClass === BomRevision || entity.billOfMaterialId) {
                const idx = poRevisions.findIndex((r) => r.id === entity.id);
                if (idx >= 0) poRevisions[idx] = entity;
                else poRevisions.push(entity);
                return entity;
              }
              if (entityClass === FitBomRevision || entity.styleId) {
                const idx = fitRevisions.findIndex((r) => r.id === entity.id);
                if (idx >= 0) fitRevisions[idx] = entity;
                else fitRevisions.push(entity);
                return entity;
              }
              return entity;
            }),
          findOne: jest
            .fn()
            .mockImplementation(async (entityClass: any, opts: any) => {
              if (entityClass === BomRevision) {
                return poRevisions.find((r) => r.id === opts.where.id) || null;
              }
              if (entityClass === FitBomRevision) {
                return fitRevisions.find((r) => r.id === opts.where.id) || null;
              }
              return null;
            }),
          find: jest
            .fn()
            .mockImplementation(async (entityClass: any, opts: any) => {
              if (entityClass === BillOfMaterialLine) {
                return poLines.filter(
                  (l) => l.revisionId === opts.where.revisionId,
                );
              }
              if (entityClass === FitBomLine) {
                return fitLines.filter(
                  (l) => l.revisionId === opts.where.revisionId,
                );
              }
              return [];
            }),
          delete: jest
            .fn()
            .mockImplementation(async (entityClass: any, opts: any) => {
              if (entityClass === BillOfMaterialLine) {
                poLines = poLines.filter(
                  (l) => l.revisionId !== opts.revisionId,
                );
              }
              if (entityClass === FitBomLine) {
                fitLines = fitLines.filter(
                  (l) => l.revisionId !== opts.revisionId,
                );
              }
            }),
          count: jest
            .fn()
            .mockImplementation(async (entityClass: any, opts: any) => {
              if (entityClass === BillOfMaterialLine) {
                return poLines.filter(
                  (l) => l.revisionId === opts.where.revisionId,
                ).length;
              }
              if (entityClass === FitBomLine) {
                return fitLines.filter(
                  (l) => l.revisionId === opts.where.revisionId,
                ).length;
              }
              return 0;
            }),
          createQueryBuilder: jest
            .fn()
            .mockImplementation((entityClass: any) => {
              let filterId: string | null = null;
              let filterBomId: string | null = null;
              let filterStyleId: string | null = null;
              let filterStatus: string | null = null;
              let filterNotId: string | null = null;
              let filterEffectiveToNull = false;

              const qb: any = {
                setLock: jest.fn().mockReturnThis(),
                where: jest
                  .fn()
                  .mockImplementation((cond: string, params: any) => {
                    if (params?.revisionId) filterId = params.revisionId;
                    if (params?.bomId) filterBomId = params.bomId;
                    if (params?.styleId) filterStyleId = params.styleId;
                    return qb;
                  }),
                andWhere: jest
                  .fn()
                  .mockImplementation((cond: string, params: any) => {
                    if (params?.status) filterStatus = params.status;
                    if (cond.includes('effective_to IS NULL'))
                      filterEffectiveToNull = true;
                    if (params?.currentId) filterNotId = params.currentId;
                    return qb;
                  }),
                orderBy: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockImplementation(async () => {
                  if (entityClass === BomRevision) {
                    let list = [...poRevisions];
                    if (filterId) list = list.filter((r) => r.id === filterId);
                    if (filterBomId)
                      list = list.filter(
                        (r) => r.billOfMaterialId === filterBomId,
                      );
                    if (filterStatus)
                      list = list.filter((r) => r.status === filterStatus);
                    if (filterEffectiveToNull)
                      list = list.filter((r) => r.effectiveTo === null);
                    if (filterNotId)
                      list = list.filter((r) => r.id !== filterNotId);
                    list.sort((a, b) => b.revisionNo - a.revisionNo);
                    return list[0] || null;
                  }
                  if (entityClass === FitBomRevision) {
                    let list = [...fitRevisions];
                    if (filterId) list = list.filter((r) => r.id === filterId);
                    if (filterStyleId)
                      list = list.filter((r) => r.styleId === filterStyleId);
                    if (filterStatus)
                      list = list.filter((r) => r.status === filterStatus);
                    if (filterEffectiveToNull)
                      list = list.filter((r) => r.effectiveTo === null);
                    if (filterNotId)
                      list = list.filter((r) => r.id !== filterNotId);
                    list.sort((a, b) => b.revisionNo - a.revisionNo);
                    return list[0] || null;
                  }
                  return null;
                }),
              };
              return qb;
            }),
        },
      };
      return qr;
    };

    const bomRepoMock = {
      findOne: jest.fn().mockImplementation(async ({ where }: any) => {
        return poBoms.find((b) => b.id === where.id) || null;
      }),
    };

    const styleRepoMock = {
      findOne: jest.fn().mockImplementation(async ({ where }: any) => {
        return styles.find((s) => s.id === where.id) || null;
      }),
    };

    const bomRevisionRepoMock = {
      findOne: jest.fn().mockImplementation(async ({ where }: any) => {
        return poRevisions.find((r) => r.id === where.id) || null;
      }),
      find: jest.fn().mockImplementation(async ({ where, order }: any) => {
        const rows = poRevisions.filter(
          (r) => r.billOfMaterialId === where.billOfMaterialId,
        );
        if (order?.revisionNo === 'DESC') {
          rows.sort((a, b) => b.revisionNo - a.revisionNo);
        }
        return rows;
      }),
      save: jest.fn().mockImplementation(async (entity: any) => {
        const idx = poRevisions.findIndex((r) => r.id === entity.id);
        if (idx >= 0) poRevisions[idx] = entity;
        else poRevisions.push(entity);
        return entity;
      }),
      createQueryBuilder: jest.fn().mockImplementation(() => {
        let bId: string;
        let bDate: string;
        const qb: any = {
          where: jest.fn().mockImplementation((c, p) => {
            if (p?.bomId) bId = p.bomId;
            return qb;
          }),
          andWhere: jest.fn().mockImplementation((c, p) => {
            if (p?.businessDate) bDate = p.businessDate;
            return qb;
          }),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockImplementation(async () => {
            return (
              poRevisions
                .filter(
                  (r) =>
                    r.billOfMaterialId === bId &&
                    r.status === RevisionStatus.APPROVED &&
                    (r.effectiveFrom === null ||
                      (bDate && r.effectiveFrom <= bDate)) &&
                    (r.effectiveTo === null ||
                      (bDate && bDate < r.effectiveTo)),
                )
                .sort((a, b) => b.revisionNo - a.revisionNo)[0] || null
            );
          }),
        };
        return qb;
      }),
    };

    const fitBomRevisionRepoMock = {
      findOne: jest.fn().mockImplementation(async ({ where }: any) => {
        return fitRevisions.find((r) => r.id === where.id) || null;
      }),
      find: jest.fn().mockImplementation(async ({ where }: any) => {
        return fitRevisions.filter((r) => r.styleId === where.styleId);
      }),
      save: jest.fn().mockImplementation(async (entity: any) => {
        const idx = fitRevisions.findIndex((r) => r.id === entity.id);
        if (idx >= 0) fitRevisions[idx] = entity;
        else fitRevisions.push(entity);
        return entity;
      }),
      createQueryBuilder: jest.fn().mockImplementation(() => {
        let sId: string;
        let bDate: string;
        const qb: any = {
          where: jest.fn().mockImplementation((c, p) => {
            if (p?.styleId) sId = p.styleId;
            return qb;
          }),
          andWhere: jest.fn().mockImplementation((c, p) => {
            if (p?.businessDate) bDate = p.businessDate;
            return qb;
          }),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockImplementation(async () => {
            return (
              fitRevisions
                .filter(
                  (r) =>
                    r.styleId === sId &&
                    r.status === RevisionStatus.APPROVED &&
                    (r.effectiveFrom === null ||
                      (bDate && r.effectiveFrom <= bDate)) &&
                    (r.effectiveTo === null ||
                      (bDate && bDate < r.effectiveTo)),
                )
                .sort((a, b) => b.revisionNo - a.revisionNo)[0] || null
            );
          }),
        };
        return qb;
      }),
    };

    const bomLineRepoMock = {
      count: jest.fn().mockImplementation(async (opts: any) => {
        return poLines.filter((l) => l.revisionId === opts.where.revisionId)
          .length;
      }),
      find: jest.fn().mockImplementation(async (opts: any) => {
        return poLines.filter((l) => l.revisionId === opts.where.revisionId);
      }),
    };

    const fitBomLineRepoMock = {
      count: jest.fn().mockImplementation(async (opts: any) => {
        return fitLines.filter((l) => l.revisionId === opts.where.revisionId)
          .length;
      }),
      find: jest.fn().mockImplementation(async (opts: any) => {
        return fitLines.filter((l) => l.revisionId === opts.where.revisionId);
      }),
    };

    const dataSourceMock = {
      createQueryRunner: jest.fn().mockImplementation(createQueryRunnerMock),
      query: jest.fn(),
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

  // ==========================================
  // CREATE TESTS (Scenarios 1-3)
  // ==========================================
  describe('CREATE REVISION (Scenarios 1-3)', () => {
    it('1. Create Rev 2 -> creates with status Draft', async () => {
      const res = await service.createRevision('bom-1', {}, currentUser);
      expect(res).toBeDefined();
      expect(res.status).toBe(RevisionStatus.DRAFT);
      expect(res.effectiveFrom).toBeNull();
      expect(res.effectiveTo).toBeNull();
    });

    it('2. revision_no automatically increments (1 -> 2)', async () => {
      const res = await service.createRevision('bom-1', {}, currentUser);
      expect(res.revisionNo).toBe(2);
    });

    it('3. Sequential/concurrent create respects next revision_no', async () => {
      const res1 = await service.createRevision('bom-1', {}, currentUser);
      const res2 = await service.createRevision('bom-1', {}, currentUser);
      expect(res1.revisionNo).toBe(2);
      expect(res2.revisionNo).toBe(3);
      expect(res1.revisionNo).not.toBe(res2.revisionNo);
    });
  });

  // ==========================================
  // CLONE TESTS (Scenarios 4-7)
  // ==========================================
  describe('CLONE REVISION (Scenarios 4-7)', () => {
    it('4. Clone Rev 1 -> creates Rev 2 in draft with cloned lines', async () => {
      const res = await service.createRevision(
        'bom-1',
        { cloneFromRevisionId: 'rev-1' },
        currentUser,
      );
      expect(res.revisionNo).toBe(2);
      expect(res.lines).toHaveLength(1);
      expect(res.lines[0].materialNameSnapshot).toBe('Cotton 100%');
      expect(res.lines[0].revisionId).toBe(res.id);
    });

    it('5. Cloned lines have new distinct IDs', async () => {
      const res = await service.createRevision(
        'bom-1',
        { cloneFromRevisionId: 'rev-1' },
        currentUser,
      );
      expect(res.lines[0].id).not.toBe(poLines[0].id);
    });

    it('6. Material snapshot & cost are accurately cloned', async () => {
      const res = await service.createRevision(
        'bom-1',
        { cloneFromRevisionId: 'rev-1' },
        currentUser,
      );
      expect(res.lines[0].materialNameSnapshot).toBe('Cotton 100%');
      expect(res.lines[0].materialGroupSnapshot).toBe('Vải chính');
      expect(res.lines[0].unitSnapshot).toBe('Mét');
      expect(res.lines[0].unitCost).toBe(50000);
      expect(res.lines[0].consumptionPerUnit).toBe(1.5);
    });

    it('7. Rev 1 remains completely unchanged after clone', async () => {
      await service.createRevision(
        'bom-1',
        { cloneFromRevisionId: 'rev-1' },
        currentUser,
      );
      const rev1 = poRevisions.find((r) => r.id === 'rev-1');
      expect(rev1.status).toBe(RevisionStatus.APPROVED);
      expect(rev1.effectiveFrom).toBeNull();
      expect(rev1.effectiveTo).toBeNull();
      expect(poLines.filter((l) => l.revisionId === 'rev-1')).toHaveLength(1);
    });
  });

  // ==========================================
  // EDIT DRAFT & IMMUTABILITY GUARDS (Scenarios 8-11, 20-21)
  // ==========================================
  describe('EDIT DRAFT & IMMUTABILITY (Scenarios 8-11, 20-21)', () => {
    let draftRevId: string;

    beforeEach(async () => {
      const rev = await service.createRevision('bom-1', {}, currentUser);
      draftRevId = rev.id;
    });

    it('8. Draft edit -> PASS (allows updating lines and header)', async () => {
      const updated = await service.updateDraftRevision(
        'bom-1',
        draftRevId,
        {
          changeReason: 'Updated material',
          lines: [
            {
              materialNameSnapshot: 'Polyester Silk',
              unitSnapshot: 'Mét',
              consumptionPerUnit: 2.0,
              unitCost: 80000,
            },
          ],
        },
        currentUser,
      );

      expect(updated.changeReason).toBe('Updated material');
      expect(updated.lines).toHaveLength(1);
      expect(updated.lines[0].materialNameSnapshot).toBe('Polyester Silk');
      expect(updated.lines[0].unitCost).toBe(80000);
    });

    it('9. In Review edit -> REJECT (throws BadRequestException)', async () => {
      // Put into review
      poRevisions.find((r) => r.id === draftRevId).status =
        RevisionStatus.IN_REVIEW;

      await expect(
        service.updateDraftRevision(
          'bom-1',
          draftRevId,
          { lines: [{ materialNameSnapshot: 'New Mat', unitSnapshot: 'Cái' }] },
          currentUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('10 & 20. Approved Revision mutation -> REJECT (immutability guard)', async () => {
      await expect(
        service.updateDraftRevision(
          'bom-1',
          'rev-1', // rev-1 is APPROVED
          {
            lines: [
              { materialNameSnapshot: 'Hacked line', unitSnapshot: 'Cái' },
            ],
          },
          currentUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('11. Cancelled Revision edit -> REJECT', async () => {
      poRevisions.find((r) => r.id === draftRevId).status =
        RevisionStatus.CANCELLED;

      await expect(
        service.updateDraftRevision(
          'bom-1',
          draftRevId,
          {
            lines: [{ materialNameSnapshot: 'New line', unitSnapshot: 'Cái' }],
          },
          currentUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('21. Direct call to assertRevisionEditable throws if not draft', () => {
      expect(() =>
        assertRevisionEditable({ status: RevisionStatus.APPROVED } as any),
      ).toThrow(BadRequestException);

      expect(() =>
        assertRevisionEditable({ status: RevisionStatus.IN_REVIEW } as any),
      ).toThrow(BadRequestException);

      expect(() =>
        assertRevisionEditable({ status: RevisionStatus.CANCELLED } as any),
      ).toThrow(BadRequestException);

      expect(() =>
        assertRevisionEditable({ status: RevisionStatus.DRAFT } as any),
      ).not.toThrow();
    });
  });

  // ==========================================
  // WORKFLOW & STATE TRANSITIONS (Scenarios 12-14)
  // ==========================================
  describe('WORKFLOW & STATE TRANSITIONS (Scenarios 12-14)', () => {
    let draftRevId: string;

    beforeEach(async () => {
      const rev = await service.createRevision(
        'bom-1',
        { cloneFromRevisionId: 'rev-1' },
        currentUser,
      );
      draftRevId = rev.id;
    });

    it('12. Draft -> In Review -> PASS', async () => {
      const submitted = await service.submitRevisionForReview(
        'bom-1',
        draftRevId,
        { reason: 'Ready for review' },
        currentUser,
      );
      expect(submitted.status).toBe(RevisionStatus.IN_REVIEW);
      expect(submitted.changeReason).toBe('Ready for review');
    });

    it('12b. Submit with 0 lines -> REJECT (requires at least 1 line)', async () => {
      // Empty lines
      poLines = poLines.filter((l) => l.revisionId !== draftRevId);

      await expect(
        service.submitRevisionForReview('bom-1', draftRevId, {}, currentUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('13. In Review -> Approve -> PASS', async () => {
      // First submit to in_review
      await service.submitRevisionForReview(
        'bom-1',
        draftRevId,
        {},
        currentUser,
      );

      // Now approve
      const approved = await service.approveRevision(
        'bom-1',
        draftRevId,
        { effectiveFrom: '2026-05-01' },
        currentUser,
      );
      expect(approved.status).toBe(RevisionStatus.APPROVED);
      expect(approved.effectiveFrom).toBe('2026-05-01');
      expect(approved.approvedBy).toBe('user-1');
      expect(approved.approvedAt).toBeDefined();
    });

    it('14. Invalid direct transition (Draft -> Approve) -> REJECT', async () => {
      // Trying to approve while still in draft
      await expect(
        service.approveRevision(
          'bom-1',
          draftRevId,
          { effectiveFrom: '2026-05-01' },
          currentUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('14b. In Review -> Reject -> returns to Draft with reason', async () => {
      await service.submitRevisionForReview(
        'bom-1',
        draftRevId,
        {},
        currentUser,
      );

      const rejected = await service.rejectRevision(
        'bom-1',
        draftRevId,
        { reason: 'Consumption too high, please recalculate' },
        currentUser,
      );
      expect(rejected.status).toBe(RevisionStatus.DRAFT);
      expect(rejected.changeReason).toBe(
        'Consumption too high, please recalculate',
      );
    });

    it('14c. Draft/In_Review -> Cancel -> sets Cancelled', async () => {
      const cancelled = await service.cancelRevision(
        'bom-1',
        draftRevId,
        { reason: 'PO cancelled by client' },
        currentUser,
      );
      expect(cancelled.status).toBe(RevisionStatus.CANCELLED);
      expect(cancelled.changeReason).toBe('PO cancelled by client');
    });

    it('14d. Cannot cancel an Approved revision', async () => {
      await expect(
        service.cancelRevision(
          'bom-1',
          'rev-1',
          { reason: 'try cancel approved' },
          currentUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('14e. Unauthorized user (NVKH) attempting to approve -> REJECT (ForbiddenException)', async () => {
      await service.submitRevisionForReview(
        'bom-1',
        draftRevId,
        {},
        currentUser,
      );

      await expect(
        service.approveRevision(
          'bom-1',
          draftRevId,
          { effectiveFrom: '2026-05-01' },
          nvkhUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================
  // APPROVAL & EFFECTIVE DATE CONTINUITY (Scenarios 15-19)
  // ==========================================
  describe('APPROVAL & EFFECTIVE DATE RULES (Scenarios 15-19)', () => {
    let rev2Id: string;

    beforeEach(async () => {
      const rev = await service.createRevision(
        'bom-1',
        { cloneFromRevisionId: 'rev-1' },
        currentUser,
      );
      rev2Id = rev.id;
      await service.submitRevisionForReview('bom-1', rev2Id, {}, currentUser);
    });

    it('15. Rev >= 2 without effective_from -> REJECT', async () => {
      await expect(
        service.approveRevision(
          'bom-1',
          rev2Id,
          { effectiveFrom: '' },
          currentUser,
        ),
      ).rejects.toThrow();
    });

    it('16 & 18. Adjacent range & auto close previous revision effective_to', async () => {
      const approved = await service.approveRevision(
        'bom-1',
        rev2Id,
        { effectiveFrom: '2026-06-01' },
        currentUser,
      );
      expect(approved.status).toBe(RevisionStatus.APPROVED);
      expect(approved.effectiveFrom).toBe('2026-06-01');
      expect(approved.effectiveTo).toBeNull();

      // Check Rev 1 was automatically closed with effective_to = 2026-06-01
      const rev1 = poRevisions.find((r) => r.id === 'rev-1');
      expect(rev1.effectiveTo).toBe('2026-06-01');
      expect(rev1.status).toBe(RevisionStatus.APPROVED); // Kept approved, not superseded!
    });

    it('17. effectiveFrom before previous revision effectiveFrom -> REJECT', async () => {
      // Set rev 1 effectiveFrom = 2026-07-01
      poRevisions.find((r) => r.id === 'rev-1').effectiveFrom = '2026-07-01';

      await expect(
        service.approveRevision(
          'bom-1',
          rev2Id,
          { effectiveFrom: '2026-05-01' }, // earlier than rev 1!
          currentUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('19. Legacy baseline [NULL, NULL) smoothly transitions to [NULL, Rev2.effectiveFrom)', async () => {
      const rev1Before = poRevisions.find((r) => r.id === 'rev-1');
      expect(rev1Before.effectiveFrom).toBeNull();
      expect(rev1Before.effectiveTo).toBeNull();

      await service.approveRevision(
        'bom-1',
        rev2Id,
        { effectiveFrom: '2026-04-01' },
        currentUser,
      );

      const rev1After = poRevisions.find((r) => r.id === 'rev-1');
      expect(rev1After.effectiveFrom).toBeNull();
      expect(rev1After.effectiveTo).toBe('2026-04-01');
    });
  });

  // ==========================================
  // CONCURRENCY & OPTIMISTIC LOCKING (Scenarios 22-23)
  // ==========================================
  describe('CONCURRENCY & ROW VERSION (Scenarios 22-23)', () => {
    it('23. Optimistic locking conflict on updateDraftRevision -> REJECT (409 Conflict)', async () => {
      const rev = await service.createRevision('bom-1', {}, currentUser);

      // User submits with stale expectedRowVersion
      await expect(
        service.updateDraftRevision(
          'bom-1',
          rev.id,
          {
            expectedRowVersion: 999, // Stale!
            lines: [{ materialNameSnapshot: 'Test', unitSnapshot: 'Cái' }],
          },
          currentUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('22. Optimistic locking conflict on approveRevision -> REJECT (409 Conflict)', async () => {
      const rev = await service.createRevision(
        'bom-1',
        { cloneFromRevisionId: 'rev-1' },
        currentUser,
      );
      await service.submitRevisionForReview('bom-1', rev.id, {}, currentUser);

      // Another transaction updated the row version
      poRevisions.find((r) => r.id === rev.id).rowVersion = 5;

      await expect(
        service.approveRevision(
          'bom-1',
          rev.id,
          {
            effectiveFrom: '2026-08-01',
            expectedRowVersion: 1, // Stale!
          },
          currentUser,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ==========================================
  // PRODUCTION SAFETY & RESOLVER ISOLATION (Scenarios 24-27)
  // ==========================================
  describe('PRODUCTION SAFETY & EFFECTIVE DATE RESOLUTION (Scenarios 24-27)', () => {
    let rev2Id: string;

    beforeEach(async () => {
      const rev = await service.createRevision(
        'bom-1',
        { cloneFromRevisionId: 'rev-1' },
        currentUser,
      );
      rev2Id = rev.id;
    });

    it('24. Draft revision is NEVER returned by getActivePoBomRevision', async () => {
      const active = await service.getActivePoBomRevision(
        'bom-1',
        '2026-09-01',
      );
      expect(active?.id).toBe('rev-1');
      expect(active?.id).not.toBe(rev2Id);
    });

    it('25. In Review revision is NEVER returned by getActivePoBomRevision', async () => {
      await service.submitRevisionForReview('bom-1', rev2Id, {}, currentUser);
      const active = await service.getActivePoBomRevision(
        'bom-1',
        '2026-09-01',
      );
      expect(active?.id).toBe('rev-1');
      expect(active?.id).not.toBe(rev2Id);
    });

    it('26. Approved revision with future effective_from is NOT active before that date', async () => {
      await service.submitRevisionForReview('bom-1', rev2Id, {}, currentUser);
      await service.approveRevision(
        'bom-1',
        rev2Id,
        { effectiveFrom: '2026-06-01' },
        currentUser,
      );

      // Query on 2026-05-15 (before effective date) -> Must return Rev 1!
      const activeBefore = await service.getActivePoBomRevision(
        'bom-1',
        '2026-05-15',
      );
      expect(activeBefore?.id).toBe('rev-1');
    });

    it('27. On or after effective_from, new revision becomes the Active Revision', async () => {
      await service.submitRevisionForReview('bom-1', rev2Id, {}, currentUser);
      await service.approveRevision(
        'bom-1',
        rev2Id,
        { effectiveFrom: '2026-06-01' },
        currentUser,
      );

      // Query on exactly 2026-06-01 -> Must return Rev 2!
      const activeOnDate = await service.getActivePoBomRevision(
        'bom-1',
        '2026-06-01',
      );
      expect(activeOnDate?.id).toBe(rev2Id);
      expect(activeOnDate?.revisionNo).toBe(2);
    });
  });

  // ==========================================
  // LIST REVISIONS ENDPOINT
  // ==========================================
  describe('listRevisions', () => {
    it('returns all revisions ordered by revisionNo DESC with line count and totalCost', async () => {
      await service.createRevision(
        'bom-1',
        { cloneFromRevisionId: 'rev-1' },
        currentUser,
      );
      const list = await service.listRevisions('bom-1', currentUser);
      expect(list).toHaveLength(2);
      expect(list[0].revisionNo).toBe(2);
      expect(list[1].revisionNo).toBe(1);
    });
  });
});
