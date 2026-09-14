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
                if (sql.includes('fit_bom_revisions')) {
                  const sId = params[0];
                  const revs = fitRevisions.filter(
                    (r) =>
                      r.styleId === sId &&
                      (sql.includes('revision_no IS NOT NULL')
                        ? r.revisionNo != null
                        : sql.includes('approved')
                          ? r.status === RevisionStatus.APPROVED
                          : r.revisionNo != null),
                  );
                  const validNos = revs
                    .map((r) => r.revisionNo)
                    .filter((n) => n != null);
                  const maxNo = validNos.length > 0 ? Math.max(...validNos) : 0;
                  return [{ max_no: maxNo }];
                } else if (sql.includes('bom_revisions')) {
                  const bId = params[0];
                  const revs = poRevisions.filter(
                    (r) =>
                      r.billOfMaterialId === bId &&
                      (sql.includes('revision_no IS NOT NULL')
                        ? r.revisionNo != null
                        : sql.includes('approved')
                          ? r.status === RevisionStatus.APPROVED
                          : r.revisionNo != null),
                  );
                  const validNos = revs
                    .map((r) => r.revisionNo)
                    .filter((n) => n != null);
                  const maxNo = validNos.length > 0 ? Math.max(...validNos) : 0;
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
                    if (params?.id) filterId = params.id;
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
                  if (entityClass === BillOfMaterials) {
                    return poBoms.find((b) => b.id === filterId) || null;
                  }
                  if (entityClass === Style) {
                    return styles.find((s) => s.id === filterId) || null;
                  }
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
                    list.sort(
                      (a, b) => (b.revisionNo || 0) - (a.revisionNo || 0),
                    );
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
                    list.sort(
                      (a, b) => (b.revisionNo || 0) - (a.revisionNo || 0),
                    );
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
        rows.sort((a, b) => {
          if (a.revisionNo == null && b.revisionNo != null) return -1;
          if (a.revisionNo != null && b.revisionNo == null) return 1;
          if (a.revisionNo != null && b.revisionNo != null)
            return b.revisionNo - a.revisionNo;
          return 0;
        });
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
        let statuses: string[] | undefined;
        const qb: any = {
          where: jest.fn().mockImplementation((c, p) => {
            if (p?.bomId) bId = p.bomId;
            return qb;
          }),
          andWhere: jest.fn().mockImplementation((c, p) => {
            if (p?.businessDate) bDate = p.businessDate;
            if (p?.statuses) statuses = p.statuses;
            return qb;
          }),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockImplementation(async () => {
            if (statuses) {
              const rows = poRevisions.filter(
                (r) =>
                  r.billOfMaterialId === bId && statuses!.includes(r.status),
              );
              return rows[rows.length - 1] || null;
            }
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
                .sort(
                  (a, b) => (b.revisionNo || 0) - (a.revisionNo || 0),
                )[0] || null
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
        const rows = fitRevisions.filter((r) => r.styleId === where.styleId);
        rows.sort((a, b) => {
          if (a.revisionNo == null && b.revisionNo != null) return -1;
          if (a.revisionNo != null && b.revisionNo == null) return 1;
          if (a.revisionNo != null && b.revisionNo != null)
            return b.revisionNo - a.revisionNo;
          return 0;
        });
        return rows;
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
        let statuses: string[] | undefined;
        const qb: any = {
          where: jest.fn().mockImplementation((c, p) => {
            if (p?.styleId) sId = p.styleId;
            return qb;
          }),
          andWhere: jest.fn().mockImplementation((c, p) => {
            if (p?.businessDate) bDate = p.businessDate;
            if (p?.statuses) statuses = p.statuses;
            return qb;
          }),
          orderBy: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockImplementation(async () => {
            if (statuses) {
              const rows = fitRevisions.filter(
                (r) =>
                  r.styleId === sId && statuses!.includes(r.status),
              );
              return rows[rows.length - 1] || null;
            }
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
                .sort(
                  (a, b) => (b.revisionNo || 0) - (a.revisionNo || 0),
                )[0] || null
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
    it('1. Create Draft -> creates with status Draft and revisionNo = null', async () => {
      const res = await service.createRevision('bom-1', {}, currentUser);
      expect(res).toBeDefined();
      expect(res.status).toBe(RevisionStatus.DRAFT);
      expect(res.revisionNo).toBeNull();
      expect(res.effectiveFrom).toBeNull();
      expect(res.effectiveTo).toBeNull();
    });

    it('2. revision_no is null on create (does NOT consume a version number)', async () => {
      const res = await service.createRevision('bom-1', {}, currentUser);
      expect(res.revisionNo).toBeNull();
    });

    it('3. Multiple draft creations all have revisionNo = null', async () => {
      const res1 = await service.createRevision('bom-1', {}, currentUser);
      const res2 = await service.createRevision('bom-1', {}, currentUser);
      expect(res1.revisionNo).toBeNull();
      expect(res2.revisionNo).toBeNull();
    });
  });

  // ==========================================
  // CLONE TESTS (Scenarios 4-7)
  // ==========================================
  describe('CLONE REVISION (Scenarios 4-7)', () => {
    it('4. Clone Rev 1 -> creates draft with revisionNo = null and cloned lines', async () => {
      const res = await service.createRevision(
        'bom-1',
        { cloneFromRevisionId: 'rev-1' },
        currentUser,
      );
      expect(res.status).toBe(RevisionStatus.DRAFT);
      expect(res.revisionNo).toBeNull();
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

    it('7. Rev 1 remains completely unchanged after clone (revisionNo = 1, approved)', async () => {
      await service.createRevision(
        'bom-1',
        { cloneFromRevisionId: 'rev-1' },
        currentUser,
      );
      const rev1 = poRevisions.find((r) => r.id === 'rev-1');
      expect(rev1.revisionNo).toBe(1);
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

    it('8. Draft edit -> PASS (revisionNo stays null)', async () => {
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
      expect(updated.revisionNo).toBeNull();
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

    it('12. Draft -> In Review -> PASS (revisionNo stays null)', async () => {
      const submitted = await service.submitRevisionForReview(
        'bom-1',
        draftRevId,
        { reason: 'Ready for review' },
        currentUser,
      );
      expect(submitted.status).toBe(RevisionStatus.IN_REVIEW);
      expect(submitted.revisionNo).toBeNull();
      expect(submitted.changeReason).toBe('Ready for review');
    });

    it('12b. Submit with 0 lines -> REJECT (requires at least 1 line)', async () => {
      // Empty lines
      poLines = poLines.filter((l) => l.revisionId !== draftRevId);

      await expect(
        service.submitRevisionForReview('bom-1', draftRevId, {}, currentUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('13. In Review -> Approve -> PASS (revision_no assigned only at approval)', async () => {
      // Draft has null revisionNo
      const draftBefore = poRevisions.find((r) => r.id === draftRevId);
      expect(draftBefore.revisionNo).toBeNull();

      // First submit to in_review
      const submitted = await service.submitRevisionForReview(
        'bom-1',
        draftRevId,
        {},
        currentUser,
      );
      expect(submitted.revisionNo).toBeNull();

      // Now approve -> receives official next revision_no = 2
      const approved = await service.approveRevision(
        'bom-1',
        draftRevId,
        { effectiveFrom: '2026-05-01' },
        currentUser,
      );
      expect(approved.status).toBe(RevisionStatus.APPROVED);
      expect(approved.revisionNo).toBe(2);
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

    it('14b. In Review -> Reject -> returns to Draft with reason (revisionNo stays null)', async () => {
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
      expect(rejected.revisionNo).toBeNull();
      expect(rejected.changeReason).toBe(
        'Consumption too high, please recalculate',
      );
    });

    it('14c. Draft/In_Review -> Cancel -> sets Cancelled (revisionNo stays null)', async () => {
      const cancelled = await service.cancelRevision(
        'bom-1',
        draftRevId,
        { reason: 'PO cancelled by client' },
        currentUser,
      );
      expect(cancelled.status).toBe(RevisionStatus.CANCELLED);
      expect(cancelled.revisionNo).toBeNull();
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

    it('Sequential approvals: Rev 1 -> Rev 2 -> Rev 3', async () => {
      const app2 = await service.approveRevision(
        'bom-1',
        rev2Id,
        { effectiveFrom: '2026-05-01' },
        currentUser,
      );
      expect(app2.revisionNo).toBe(2);

      const draft3 = await service.createRevision('bom-1', {}, currentUser);
      expect(draft3.revisionNo).toBeNull();

      await service.updateDraftRevision(
        'bom-1',
        draft3.id,
        { lines: [{ materialNameSnapshot: 'Thread', unitSnapshot: 'Cuộn' }] },
        currentUser,
      );
      await service.submitRevisionForReview('bom-1', draft3.id, {}, currentUser);

      const app3 = await service.approveRevision(
        'bom-1',
        draft3.id,
        { effectiveFrom: '2026-06-01' },
        currentUser,
      );
      expect(app3.revisionNo).toBe(3);
    });

    it('Concurrent approvals: unique sequential revision numbers (no duplicates)', async () => {
      const draftA = await service.createRevision('bom-1', {}, currentUser);
      const draftB = await service.createRevision('bom-1', {}, currentUser);

      expect(draftA.revisionNo).toBeNull();
      expect(draftB.revisionNo).toBeNull();

      await service.updateDraftRevision(
        'bom-1',
        draftA.id,
        { lines: [{ materialNameSnapshot: 'Line A', unitSnapshot: 'M' }] },
        currentUser,
      );
      await service.updateDraftRevision(
        'bom-1',
        draftB.id,
        { lines: [{ materialNameSnapshot: 'Line B', unitSnapshot: 'M' }] },
        currentUser,
      );

      await service.submitRevisionForReview('bom-1', draftA.id, {}, currentUser);
      await service.submitRevisionForReview('bom-1', draftB.id, {}, currentUser);

      // Approving sequentially (serialized by parent BOM pessimistic lock)
      const approvedA = await service.approveRevision(
        'bom-1',
        draftA.id,
        { effectiveFrom: '2026-06-01' },
        currentUser,
      );
      const approvedB = await service.approveRevision(
        'bom-1',
        draftB.id,
        { effectiveFrom: '2026-07-01' },
        currentUser,
      );

      expect(approvedA.revisionNo).toBe(2);
      expect(approvedB.revisionNo).toBe(3);
      expect(approvedA.revisionNo).not.toBe(approvedB.revisionNo);
    });

    it('Permanently reserved revision_no: existing revisions 1, 2, 3 with rev 3 superseded -> next approval gets Rev 4', async () => {
      // Setup existing revisions with revision_no 1, 2, 3
      // rev-1 already exists (revisionNo = 1, status = APPROVED)
      poRevisions.push({
        id: 'rev-2',
        billOfMaterialId: 'bom-1',
        revisionNo: 2,
        status: RevisionStatus.APPROVED,
        effectiveFrom: '2026-05-01',
        effectiveTo: '2026-06-01',
        rowVersion: 1,
        createdAt: new Date('2026-05-01'),
        updatedAt: new Date('2026-05-01'),
      } as any);

      // revision 3 status = superseded
      poRevisions.push({
        id: 'rev-3',
        billOfMaterialId: 'bom-1',
        revisionNo: 3,
        status: RevisionStatus.SUPERSEDED,
        effectiveFrom: '2026-06-01',
        effectiveTo: '2026-07-01',
        rowVersion: 1,
        createdAt: new Date('2026-06-01'),
        updatedAt: new Date('2026-06-01'),
      } as any);

      // Create a new draft
      const draft = await service.createRevision('bom-1', {}, currentUser);
      expect(draft.revisionNo).toBeNull();

      // Add line to draft
      await service.updateDraftRevision(
        'bom-1',
        draft.id,
        { lines: [{ materialNameSnapshot: 'New Button', unitSnapshot: 'Cái' }] },
        currentUser,
      );

      // Submit
      await service.submitRevisionForReview('bom-1', draft.id, {}, currentUser);

      // Approve
      const approved = await service.approveRevision(
        'bom-1',
        draft.id,
        { effectiveFrom: '2026-08-01' },
        currentUser,
      );

      // Must receive Rev 4, NOT Rev 3 (since 3 was permanently reserved even though superseded)
      expect(approved.revisionNo).toBe(4);
      expect(approved.status).toBe(RevisionStatus.APPROVED);
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
    it('returns all revisions with draft having revisionNo = null and approved having revisionNo = 1', async () => {
      await service.createRevision(
        'bom-1',
        { cloneFromRevisionId: 'rev-1' },
        currentUser,
      );
      const list = await service.listRevisions('bom-1', currentUser);
      expect(list).toHaveLength(2);
      expect(list[0].status).toBe(RevisionStatus.DRAFT);
      expect(list[0].revisionNo).toBeNull();
      expect(list[1].status).toBe(RevisionStatus.APPROVED);
      expect(list[1].revisionNo).toBe(1);
    });
  });

  // ==========================================
  // FIND ONE: BUSINESS VERSION VS DRAFT RESOLUTION (Scenarios 12-14)
  // ==========================================
  describe('FIND ONE (Business Version vs Draft Resolution)', () => {
    it('Draft / In Review has no business version (version is null in findOne)', async () => {
      const draft = await service.createRevision('bom-1', {}, currentUser);
      const detail = await service.findOne('bom-1', currentUser, {
        revisionId: draft.id,
      });
      expect(detail.version).toBeNull();
      expect(detail.revision?.revisionNo).toBeNull();
    });

    it('Approved revision returns official business version number', async () => {
      const detail = await service.findOne('bom-1', currentUser, {
        revisionId: 'rev-1',
      });
      expect(detail.version).toBe(1);
      expect(detail.revision?.revisionNo).toBe(1);
    });
  });

  // ==========================================
  // FIT BOM REVISION LIFECYCLE (Parity with PO BOM, Scenarios 1-15)
  // ==========================================
  describe('FIT BOM REVISION LIFECYCLE (Parity with PO BOM)', () => {
    it('1. Create Fit Draft -> revisionNo is null', async () => {
      const draft = await service.createRevision('style-1', {}, currentUser);
      expect(draft.status).toBe(RevisionStatus.DRAFT);
      expect(draft.revisionNo).toBeNull();
    });

    it('2. Edit Fit Draft -> revisionNo remains null', async () => {
      const draft = await service.createRevision('style-1', {}, currentUser);
      const updated = await service.updateDraftRevision(
        'style-1',
        draft.id,
        {
          changeReason: 'Fit edit',
          lines: [
            {
              materialNameSnapshot: 'Fit Fabric',
              unitSnapshot: 'Mét',
              consumption: 1.2,
              wastePercent: 3,
            },
          ],
        },
        currentUser,
      );
      expect(updated.revisionNo).toBeNull();
      expect(updated.lines[0].consumption).toBe(1.2);
    });

    it('3. Submit Fit Draft -> revisionNo remains null', async () => {
      const draft = await service.createRevision('style-1', {}, currentUser);
      await service.updateDraftRevision(
        'style-1',
        draft.id,
        { lines: [{ materialNameSnapshot: 'L', unitSnapshot: 'M' }] },
        currentUser,
      );
      const submitted = await service.submitRevisionForReview(
        'style-1',
        draft.id,
        {},
        currentUser,
      );
      expect(submitted.status).toBe(RevisionStatus.IN_REVIEW);
      expect(submitted.revisionNo).toBeNull();
    });

    it('4. Reject Fit Revision -> returns to draft, revisionNo remains null', async () => {
      const draft = await service.createRevision('style-1', {}, currentUser);
      await service.updateDraftRevision(
        'style-1',
        draft.id,
        { lines: [{ materialNameSnapshot: 'L', unitSnapshot: 'M' }] },
        currentUser,
      );
      await service.submitRevisionForReview(
        'style-1',
        draft.id,
        {},
        currentUser,
      );
      const rejected = await service.rejectRevision(
        'style-1',
        draft.id,
        { reason: 'Incorrect spec' },
        currentUser,
      );
      expect(rejected.status).toBe(RevisionStatus.DRAFT);
      expect(rejected.revisionNo).toBeNull();
    });

    it('5. Cancel Fit Revision -> status cancelled, revisionNo remains null', async () => {
      const draft = await service.createRevision('style-1', {}, currentUser);
      const cancelled = await service.cancelRevision(
        'style-1',
        draft.id,
        { reason: 'Cancelled style' },
        currentUser,
      );
      expect(cancelled.status).toBe(RevisionStatus.CANCELLED);
      expect(cancelled.revisionNo).toBeNull();
    });

    it('6. Clone Fit Approved Revision -> clone has revisionNo = null, source rev 1 unchanged', async () => {
      const cloned = await service.createRevision(
        'style-1',
        { cloneFromRevisionId: 'fit-rev-1' },
        currentUser,
      );
      expect(cloned.status).toBe(RevisionStatus.DRAFT);
      expect(cloned.revisionNo).toBeNull();
      expect(cloned.lines).toHaveLength(1);

      const source = fitRevisions.find((r) => r.id === 'fit-rev-1');
      expect(source.revisionNo).toBe(1);
      expect(source.status).toBe(RevisionStatus.APPROVED);
    });

    it('7. Approve Fit Revision -> gets Rev 2 on approval', async () => {
      const draft = await service.createRevision('style-1', {}, currentUser);
      await service.updateDraftRevision(
        'style-1',
        draft.id,
        { lines: [{ materialNameSnapshot: 'Fit Line', unitSnapshot: 'M' }] },
        currentUser,
      );
      await service.submitRevisionForReview(
        'style-1',
        draft.id,
        {},
        currentUser,
      );

      const approved = await service.approveRevision(
        'style-1',
        draft.id,
        { effectiveFrom: '2026-05-01' },
        currentUser,
      );
      expect(approved.status).toBe(RevisionStatus.APPROVED);
      expect(approved.revisionNo).toBe(2);

      // Fit baseline rev 1 closed
      const fitRev1 = fitRevisions.find((r) => r.id === 'fit-rev-1');
      expect(fitRev1.effectiveTo).toBe('2026-05-01');
    });

    it('8. Fit Active resolver continues returning approved revision only', async () => {
      await service.createRevision('style-1', {}, currentUser);
      const active = await service.getActiveFitBomRevision(
        'style-1',
        '2026-05-01',
      );
      expect(active?.id).toBe('fit-rev-1');
      expect(active?.revisionNo).toBe(1);
    });

    it('9. Fit Permanently reserved revision_no: existing revisions 1, 2, 3 with rev 3 superseded -> next approval gets Rev 4', async () => {
      fitRevisions.push({
        id: 'fit-rev-2',
        styleId: 'style-1',
        revisionNo: 2,
        status: RevisionStatus.APPROVED,
        effectiveFrom: '2026-05-01',
        effectiveTo: '2026-06-01',
        rowVersion: 1,
        createdAt: new Date('2026-05-01'),
        updatedAt: new Date('2026-05-01'),
      } as any);

      fitRevisions.push({
        id: 'fit-rev-3',
        styleId: 'style-1',
        revisionNo: 3,
        status: RevisionStatus.SUPERSEDED,
        effectiveFrom: '2026-06-01',
        effectiveTo: '2026-07-01',
        rowVersion: 1,
        createdAt: new Date('2026-06-01'),
        updatedAt: new Date('2026-06-01'),
      } as any);

      const draft = await service.createRevision('style-1', {}, currentUser);
      expect(draft.revisionNo).toBeNull();

      await service.updateDraftRevision(
        'style-1',
        draft.id,
        { lines: [{ materialNameSnapshot: 'Fit Collar', unitSnapshot: 'Cái' }] },
        currentUser,
      );

      await service.submitRevisionForReview('style-1', draft.id, {}, currentUser);

      const approved = await service.approveRevision(
        'style-1',
        draft.id,
        { effectiveFrom: '2026-08-01' },
        currentUser,
      );

      expect(approved.revisionNo).toBe(4);
      expect(approved.status).toBe(RevisionStatus.APPROVED);
    });
  });
});
