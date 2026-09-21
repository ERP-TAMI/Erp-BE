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
import { Material } from '../../master-data/entities/Material.entity';
import { MaterialGroup } from '../../master-data/entities/MaterialGroup.entity';
import { Unit } from '../../master-data/entities/Unit.entity';
import {
  BomRevisionStatus,
  BomType,
} from '../../../common/enums/database.enums';
import { UserRoleCode } from '../../user-management/dto/query-users.dto';

describe('BOM V2 Revision Management + History + Detail + Diff (PR-05 Specification)', () => {
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

  // In-memory state for testing
  let mockBom: Bom;
  let mockRevisions: BomRevision[];
  let mockLines: BomLine[];
  let mockHistories: BomRevisionStatusHistory[];

  function setupRevisionEnv() {
    mockBom = new Bom();
    mockBom.id = 'bom-uuid-1';
    mockBom.bomCode = 'BOM-FIT-POLO';
    mockBom.bomType = BomType.FIT;
    mockBom.styleId = 'style-1';
    mockBom.currentRevisionId = 'rev-uuid-1';
    mockBom.discontinuedAt = null;
    mockBom.rowVersion = 1;
    mockBom.createdAt = new Date('2026-03-01T08:00:00Z');
    mockBom.updatedAt = new Date('2026-03-01T08:00:00Z');

    // Rev 1 is CLOSED initially
    const rev1 = new BomRevision();
    rev1.id = 'rev-uuid-1';
    rev1.bomId = mockBom.id;
    rev1.revisionNo = 1;
    rev1.status = BomRevisionStatus.CLOSED;
    rev1.sourceRevisionId = null;
    rev1.changeReason = 'Khởi tạo ban đầu';
    rev1.createdBy = 'user-nvkh-1';
    rev1.createdAt = new Date('2026-03-01T08:00:00Z');
    rev1.approvedBy = 'user-sa-1';
    rev1.approvedAt = new Date('2026-03-02T10:00:00Z');
    rev1.rowVersion = 1;

    // Lines for Rev 1: Line A and Line B
    const lineA = new BomLine();
    lineA.id = 'line-uuid-1';
    lineA.revisionId = rev1.id;
    lineA.materialId = 'mat-uuid-1';
    lineA.materialNameSnapshot = 'Vải Cotton 100% 220gsm';
    lineA.materialGroupId = 'grp-uuid-1';
    lineA.materialGroupSnapshot = 'Vải chính';
    lineA.unitId = 'unit-uuid-1';
    lineA.unitSnapshot = 'Mét';
    lineA.consumption = 1.5;
    lineA.unitCost = 120000;
    lineA.note = 'Vải dệt kim chính phẩm';
    lineA.orderIndex = 0;
    lineA.createdAt = new Date('2026-03-01T08:00:00Z');
    lineA.updatedAt = new Date('2026-03-01T08:00:00Z');

    const lineB = new BomLine();
    lineB.id = 'line-uuid-2';
    lineB.revisionId = rev1.id;
    lineB.materialId = 'mat-uuid-2';
    lineB.materialNameSnapshot = 'Bo cổ dệt sọc';
    lineB.materialGroupId = 'grp-uuid-2';
    lineB.materialGroupSnapshot = 'Phụ liệu';
    lineB.unitId = 'unit-uuid-2';
    lineB.unitSnapshot = 'Cái';
    lineB.consumption = 1;
    lineB.unitCost = 15000;
    lineB.note = 'Đồng bộ màu vải chính';
    lineB.orderIndex = 1;
    lineB.createdAt = new Date('2026-03-01T08:00:00Z');
    lineB.updatedAt = new Date('2026-03-01T08:00:00Z');

    mockRevisions = [rev1];
    mockLines = [lineA, lineB];
    mockHistories = [];

    // Setup transaction mock
    dataSourceMock.transaction.mockImplementation(async (cb: any) => {
      const managerMock = {
        findOne: jest.fn().mockImplementation((entityClass, options) => {
          if (entityClass === Bom) {
            if (options?.where?.id === mockBom.id)
              return Promise.resolve(mockBom);
            return Promise.resolve(null);
          }
          if (entityClass === BomRevision) {
            if (options?.where?.id) {
              const r = mockRevisions.find((it) => it.id === options.where.id);
              return Promise.resolve(r || null);
            }
            if (
              options?.where?.bomId &&
              options?.where?.revisionNo !== undefined
            ) {
              const r = mockRevisions.find(
                (it) =>
                  it.bomId === options.where.bomId &&
                  it.revisionNo === options.where.revisionNo,
              );
              return Promise.resolve(r || null);
            }
            return Promise.resolve(null);
          }
          return Promise.resolve(null);
        }),
        find: jest.fn().mockImplementation((entityClass, options) => {
          if (entityClass === BomLine) {
            const revId = options?.where?.revisionId;
            const lines = mockLines.filter((l) => l.revisionId === revId);
            return Promise.resolve(lines);
          }
          return Promise.resolve([]);
        }),
        create: jest.fn().mockImplementation((entityClass, data) => {
          if (entityClass === BomRevision) {
            const r = Object.assign(new BomRevision(), data, {
              id: `rev-uuid-${mockRevisions.length + 1}`,
            });
            return r;
          }
          if (entityClass === BomLine) {
            const l = Object.assign(new BomLine(), data, {
              id: `line-uuid-${mockLines.length + 1}`,
            });
            return l;
          }
          return data;
        }),
        save: jest.fn().mockImplementation((entityClass, data) => {
          if (Array.isArray(data)) {
            for (const item of data) {
              if (item instanceof BomLine || entityClass === BomLine) {
                mockLines.push(item);
              }
            }
            return Promise.resolve(data);
          }
          if (data instanceof BomRevision || entityClass === BomRevision) {
            const idx = mockRevisions.findIndex((r) => r.id === data.id);
            if (idx >= 0) {
              mockRevisions[idx] = data;
            } else {
              mockRevisions.push(data);
            }
          }
          return Promise.resolve(data);
        }),
      };
      return cb(managerMock);
    });

    // Setup repository mocks for findOne / find
    bomRepoMock.findOne.mockImplementation((opts: any) => {
      if (opts?.where?.id === mockBom.id) return Promise.resolve(mockBom);
      return Promise.resolve(null);
    });

    bomRevisionRepoMock.findOne.mockImplementation((opts: any) => {
      const id = opts?.where?.id;
      const r = mockRevisions.find((it) => it.id === id);
      return Promise.resolve(r || null);
    });

    bomRevisionRepoMock.find.mockImplementation((opts: any) => {
      const bomId = opts?.where?.bomId;
      const filtered = mockRevisions.filter((r) => r.bomId === bomId);
      if (opts?.order?.revisionNo === 'DESC') {
        return Promise.resolve(
          [...filtered].sort((a, b) => b.revisionNo - a.revisionNo),
        );
      }
      return Promise.resolve(filtered);
    });

    bomLineRepoMock.find.mockImplementation((opts: any) => {
      const revId = opts?.where?.revisionId;
      return Promise.resolve(mockLines.filter((l) => l.revisionId === revId));
    });

    bomStatusHistoryRepoMock.find.mockImplementation((opts: any) => {
      const revId = opts?.where?.revisionId;
      return Promise.resolve(
        mockHistories.filter((h) => h.revisionId === revId),
      );
    });
  }

  beforeEach(async () => {
    bomRepoMock = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };
    bomRevisionRepoMock = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };
    bomLineRepoMock = {
      find: jest.fn(),
    };
    bomStatusHistoryRepoMock = {
      find: jest.fn(),
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
    };
    styleRepoMock = {
      findOne: jest.fn().mockResolvedValue({
        id: 'style-1',
        styleCode: 'POLO-01',
        styleName: 'Áo Polo Nam',
      }),
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
          provide: getRepositoryToken(Material),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(MaterialGroup),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: { findOne: jest.fn() },
        },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get<BomsService>(BomsService);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. CREATE REVISION FROM CLOSED REVISION (Section 3, 4, 5, 6, 10, 11)
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Create Revision from Closed Working Revision', () => {
    it('successfully creates Revision 2 from closed Revision 1 with wait_nvkh status and updated current_revision_id', async () => {
      setupRevisionEnv();

      const result = await service.createRevision(
        mockBom.id,
        { reason: 'Cập nhật định mức sau sản xuất thử' },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      // Verify BOM detail returned
      expect(result).toBeDefined();
      expect(result.status).toBe(BomRevisionStatus.WAIT_NVKH);
      expect(result.currentRevision?.revisionNo).toBe(2);
      expect(result.currentRevision?.status).toBe(BomRevisionStatus.WAIT_NVKH);
      expect(result.currentRevision?.sourceRevisionId).toBe('rev-uuid-1');
      expect(result.currentRevision?.changeReason).toBe(
        'Cập nhật định mức sau sản xuất thử',
      );

      // Verify BOM entity updated
      expect(mockBom.currentRevisionId).toBe('rev-uuid-2');
      expect(Number(mockBom.rowVersion)).toBe(2);

      // Verify Revision 2 entity created
      const rev2 = mockRevisions.find((r) => r.revisionNo === 2);
      expect(rev2).toBeDefined();
      expect(rev2?.status).toBe(BomRevisionStatus.WAIT_NVKH);
      expect(rev2?.sourceRevisionId).toBe('rev-uuid-1');
      expect(rev2?.approvedBy).toBeNull();
      expect(rev2?.approvedAt).toBeNull();

      // Invariant: Revision 1 remains closed and intact
      const rev1 = mockRevisions.find((r) => r.revisionNo === 1);
      expect(rev1?.status).toBe(BomRevisionStatus.CLOSED);
      expect(rev1?.approvedBy).toBe('user-sa-1');
    });

    it('successfully creates Revision 3 from closed Revision 2', async () => {
      setupRevisionEnv();

      // Step 1: Create Rev 2
      await service.createRevision(
        mockBom.id,
        { reason: 'Tạo Rev 2' },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );
      const rev2 = mockRevisions.find((r) => r.revisionNo === 2)!;

      // Simulate Rev 2 finishing workflow and closing
      rev2.status = BomRevisionStatus.CLOSED;
      rev2.approvedBy = 'user-sa-1';
      rev2.approvedAt = new Date();

      // Step 2: Create Rev 3
      const result = await service.createRevision(
        mockBom.id,
        { reason: 'Tạo Rev 3 cho vụ mùa sau' },
        'user-tpkh-1',
        UserRoleCode.TPKH,
      );

      expect(result.currentRevision?.revisionNo).toBe(3);
      expect(result.currentRevision?.sourceRevisionId).toBe(rev2.id);
      expect(mockBom.currentRevisionId).toBe('rev-uuid-3');
    });

    it('rejects create revision when current revision is NOT closed (400 Bad Request)', async () => {
      const nonClosedStatuses = [
        BomRevisionStatus.WAIT_NVKH,
        BomRevisionStatus.WAIT_RD,
        BomRevisionStatus.WAIT_TPKH_CONFIRM,
        BomRevisionStatus.WAIT_ACCOUNTING,
        BomRevisionStatus.WAIT_SA_APPROVE,
      ];

      for (const st of nonClosedStatuses) {
        setupRevisionEnv();
        mockRevisions[0].status = st;

        await expect(
          service.createRevision(
            mockBom.id,
            { reason: 'Attempt when not closed' },
            'user-nvkh-1',
            UserRoleCode.NVKH,
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects create revision on discontinued BOM (400 Bad Request)', async () => {
      setupRevisionEnv();
      mockBom.discontinuedAt = new Date();

      await expect(
        service.createRevision(
          mockBom.id,
          { reason: 'Attempt on discontinued BOM' },
          'user-nvkh-1',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects create revision when BOM does not exist (404 NotFoundException)', async () => {
      setupRevisionEnv();

      await expect(
        service.createRevision(
          'non-existent-bom-id',
          { reason: 'BOM not found' },
          'user-nvkh-1',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects create revision without reason or with whitespace-only reason (400 Bad Request)', async () => {
      setupRevisionEnv();

      // Empty reason
      await expect(
        service.createRevision(
          mockBom.id,
          { reason: '' },
          'user-nvkh-1',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(BadRequestException);

      // Whitespace only
      await expect(
        service.createRevision(
          mockBom.id,
          { reason: '     ' },
          'user-nvkh-1',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate revision number with ConflictException (409 Conflict)', async () => {
      setupRevisionEnv();

      // Pre-seed Rev 2 into mockRevisions so nextRevisionNo = 2 collides
      const existingRev2 = new BomRevision();
      existingRev2.id = 'rev-uuid-existing-2';
      existingRev2.bomId = mockBom.id;
      existingRev2.revisionNo = 2;
      existingRev2.status = BomRevisionStatus.WAIT_NVKH;
      mockRevisions.push(existingRev2);

      await expect(
        service.createRevision(
          mockBom.id,
          { reason: 'Duplicate collision test' },
          'user-nvkh-1',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. ROLE AUTHORIZATION (Section 14)
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Role Authorization for Revision Creation', () => {
    it('allows NVKH, TPKH, SA to create new revision', async () => {
      const allowedRoles = [
        UserRoleCode.NVKH,
        UserRoleCode.TPKH,
        UserRoleCode.SA,
      ];

      for (const role of allowedRoles) {
        setupRevisionEnv();
        const res = await service.createRevision(
          mockBom.id,
          { reason: `Authorized creation by ${role}` },
          `user-${role}`,
          role,
        );
        expect(res.currentRevision?.revisionNo).toBe(2);
      }
    });

    it('rejects RD and ACCOUNTING from creating revision (403 Forbidden)', async () => {
      const forbiddenRoles = [UserRoleCode.RD, UserRoleCode.ACCOUNTING];

      for (const role of forbiddenRoles) {
        setupRevisionEnv();
        await expect(
          service.createRevision(
            mockBom.id,
            { reason: 'Unauthorized role attempt' },
            `user-${role}`,
            role,
          ),
        ).rejects.toThrow(ForbiddenException);
      }
    });

    it('rejects anonymous / null role from creating revision (403 Forbidden)', async () => {
      setupRevisionEnv();
      await expect(
        service.createRevision(
          mockBom.id,
          { reason: 'Anonymous attempt' },
          'user-anon',
          null as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. CLONE BOM LINES & HISTORICAL SNAPSHOTS (Section 7, 8, 9, 31, 32)
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Clone BOM Lines & Snapshot Isolation', () => {
    it('clones all lines from Rev 1 to Rev 2 with new line IDs, identical material IDs, identical snapshots, and identical unitCosts', async () => {
      setupRevisionEnv();

      await service.createRevision(
        mockBom.id,
        { reason: 'Clone test' },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      const rev1Lines = mockLines.filter((l) => l.revisionId === 'rev-uuid-1');
      const rev2Lines = mockLines.filter((l) => l.revisionId === 'rev-uuid-2');

      expect(rev1Lines.length).toBe(2);
      expect(rev2Lines.length).toBe(2);

      // Verify line IDs are completely new
      expect(rev2Lines[0].id).not.toBe(rev1Lines[0].id);
      expect(rev2Lines[1].id).not.toBe(rev1Lines[1].id);

      // Verify Line A data copied accurately
      const rev2LineA = rev2Lines.find((l) => l.materialId === 'mat-uuid-1')!;
      expect(rev2LineA).toBeDefined();
      expect(rev2LineA.materialNameSnapshot).toBe('Vải Cotton 100% 220gsm');
      expect(rev2LineA.materialGroupSnapshot).toBe('Vải chính');
      expect(rev2LineA.unitSnapshot).toBe('Mét');
      expect(Number(rev2LineA.consumption)).toBe(1.5);
      expect(Number(rev2LineA.unitCost)).toBe(120000); // Unit cost cloned intact
      expect(rev2LineA.orderIndex).toBe(0);

      // Verify Line B data copied accurately
      const rev2LineB = rev2Lines.find((l) => l.materialId === 'mat-uuid-2')!;
      expect(rev2LineB).toBeDefined();
      expect(rev2LineB.materialNameSnapshot).toBe('Bo cổ dệt sọc');
      expect(Number(rev2LineB.consumption)).toBe(1);
      expect(Number(rev2LineB.unitCost)).toBe(15000); // Unit cost cloned intact
      expect(rev2LineB.orderIndex).toBe(1);
    });

    it('isolates snapshots: changes to master material do not affect cloned snapshot in Rev 2 or Rev 1', async () => {
      setupRevisionEnv();

      await service.createRevision(
        mockBom.id,
        { reason: 'Snapshot isolation test' },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      // Rev 1 and Rev 2 both have historical snapshot 'Vải Cotton 100% 220gsm'
      const rev1Detail = await service.getRevisionDetail(
        mockBom.id,
        'rev-uuid-1',
        'SA',
      );
      const rev2Detail = await service.getRevisionDetail(
        mockBom.id,
        'rev-uuid-2',
        'SA',
      );

      expect(rev1Detail.lines[0].materialNameSnapshot).toBe(
        'Vải Cotton 100% 220gsm',
      );
      expect(rev2Detail.lines[0].materialNameSnapshot).toBe(
        'Vải Cotton 100% 220gsm',
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. COST RECALCULATION & INDEPENDENCE (Section 33)
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Cost Recalculation & Independence', () => {
    it('maintains initial costPerUnit = 195000 for both Rev 1 and Rev 2 upon clone', async () => {
      setupRevisionEnv();
      // Rev 1 cost: (1.5 * 120000) + (1 * 15000) = 180000 + 15000 = 195000
      await service.createRevision(
        mockBom.id,
        { reason: 'Cost test' },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      const rev1Detail = await service.getRevisionDetail(
        mockBom.id,
        'rev-uuid-1',
        'SA',
      );
      const rev2Detail = await service.getRevisionDetail(
        mockBom.id,
        'rev-uuid-2',
        'SA',
      );

      expect(rev1Detail.costPerUnit).toBe(195000);
      expect(rev2Detail.costPerUnit).toBe(195000);
    });

    it('modifying Rev 2 line data updates Rev 2 cost while Rev 1 cost remains unchanged', async () => {
      setupRevisionEnv();

      await service.createRevision(
        mockBom.id,
        { reason: 'Cost independence test' },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      // Simulate updating Rev 2 line A consumption from 1.5 -> 2.0
      const rev2LineA = mockLines.find(
        (l) => l.revisionId === 'rev-uuid-2' && l.materialId === 'mat-uuid-1',
      )!;
      rev2LineA.consumption = 2.0;

      const rev1Detail = await service.getRevisionDetail(
        mockBom.id,
        'rev-uuid-1',
        'SA',
      );
      const rev2Detail = await service.getRevisionDetail(
        mockBom.id,
        'rev-uuid-2',
        'SA',
      );

      // Rev 1 cost stays 195000
      expect(rev1Detail.costPerUnit).toBe(195000);

      // Rev 2 cost is now: (2.0 * 120000) + (1 * 15000) = 240000 + 15000 = 255000
      expect(rev2Detail.costPerUnit).toBe(255000);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. REVISION LIST & ANTI N+1 (Section 16, 36)
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. Revision List API & Anti-N+1', () => {
    it('returns revisions sorted by revisionNo DESC with isCurrent indicator', async () => {
      setupRevisionEnv();

      // Create Rev 2
      await service.createRevision(
        mockBom.id,
        { reason: 'Create Rev 2' },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      // Clear mock calls from createRevision before testing getRevisions anti-N+1
      bomLineRepoMock.find.mockClear();

      const list = await service.getRevisions(mockBom.id);

      expect(list.length).toBe(2);
      expect(list[0].revisionNo).toBe(2);
      expect(list[0].isCurrent).toBe(true);
      expect(list[0].status).toBe(BomRevisionStatus.WAIT_NVKH);

      expect(list[1].revisionNo).toBe(1);
      expect(list[1].isCurrent).toBe(false);
      expect(list[1].status).toBe(BomRevisionStatus.CLOSED);

      // Anti N+1 verification: bomLineRepository.find was NOT called during getRevisions
      expect(bomLineRepoMock.find).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when BOM does not exist for revision list (404)', async () => {
      setupRevisionEnv();
      await expect(service.getRevisions('non-existent-bom')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. REVISION DETAIL & COST MASKING (Section 17, 22)
  // ──────────────────────────────────────────────────────────────────────────
  describe('6. Revision Detail API & Cost Masking', () => {
    it('masks unitCost and costPerUnit for NVKH and RD roles in revision detail', async () => {
      setupRevisionEnv();

      const detailNVKH = await service.getRevisionDetail(
        mockBom.id,
        'rev-uuid-1',
        UserRoleCode.NVKH,
      );
      expect(detailNVKH.costPerUnit).toBeNull();
      expect(detailNVKH.lines[0].unitCost).toBeNull();
      expect(detailNVKH.lines[0].lineCost).toBeNull();

      const detailRD = await service.getRevisionDetail(
        mockBom.id,
        'rev-uuid-1',
        UserRoleCode.RD,
      );
      expect(detailRD.costPerUnit).toBeNull();
      expect(detailRD.lines[0].unitCost).toBeNull();
    });

    it('exposes full costs for TPKH, ACCOUNTING, and SA roles in revision detail', async () => {
      setupRevisionEnv();

      const roles = [
        UserRoleCode.TPKH,
        UserRoleCode.ACCOUNTING,
        UserRoleCode.SA,
      ];
      for (const role of roles) {
        const detail = await service.getRevisionDetail(
          mockBom.id,
          'rev-uuid-1',
          role,
        );
        expect(detail.costPerUnit).toBe(195000);
        expect(detail.lines[0].unitCost).toBe(120000);
        expect(detail.lines[0].lineCost).toBe(180000);
      }
    });

    it('throws NotFoundException when revision belongs to another BOM (404)', async () => {
      setupRevisionEnv();

      // Foreign revision belonging to another BOM
      const foreignRev = new BomRevision();
      foreignRev.id = 'foreign-rev-id';
      foreignRev.bomId = 'another-bom-id';
      mockRevisions.push(foreignRev);

      await expect(
        service.getRevisionDetail(mockBom.id, 'foreign-rev-id', 'SA'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. REVISION HISTORY INDEPENDENCE (Section 18, 35)
  // ──────────────────────────────────────────────────────────────────────────
  describe('7. Revision History Independence', () => {
    it('returns isolated history for each revision independently', async () => {
      setupRevisionEnv();

      // Rev 1 history
      const h1 = new BomRevisionStatusHistory();
      h1.id = 'hist-1';
      h1.revisionId = 'rev-uuid-1';
      h1.oldStatus = BomRevisionStatus.WAIT_SA_APPROVE;
      h1.newStatus = BomRevisionStatus.CLOSED;
      h1.action = 'approve';
      mockHistories.push(h1);

      // Create Rev 2
      await service.createRevision(
        mockBom.id,
        { reason: 'Create Rev 2' },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      // Rev 2 history
      const h2 = new BomRevisionStatusHistory();
      h2.id = 'hist-2';
      h2.revisionId = 'rev-uuid-2';
      h2.oldStatus = BomRevisionStatus.WAIT_NVKH;
      h2.newStatus = BomRevisionStatus.WAIT_RD;
      h2.action = 'forward';
      mockHistories.push(h2);

      const rev1History = await service.getRevisionHistory(
        mockBom.id,
        'rev-uuid-1',
      );
      const rev2History = await service.getRevisionHistory(
        mockBom.id,
        'rev-uuid-2',
      );

      expect(rev1History.length).toBe(1);
      expect(rev1History[0].action).toBe('approve');

      expect(rev2History.length).toBe(1);
      expect(rev2History[0].action).toBe('forward');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. REVISION DIFF SPECIFICATION (Section 19, 20, 21, 22, 34)
  // ──────────────────────────────────────────────────────────────────────────
  describe('8. Revision Diff Specification', () => {
    it('correctly categorizes ADDED, REMOVED, CHANGED, and UNCHANGED lines between Rev 1 and Rev 2', async () => {
      setupRevisionEnv();

      // Create Rev 2
      await service.createRevision(
        mockBom.id,
        { reason: 'Diff test' },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      // In Rev 2:
      // - Line A (mat-uuid-1): CHANGED (consumption 1.5 -> 1.8)
      // - Line B (mat-uuid-2): REMOVED (deleted from rev 2)
      // - Line C (mat-uuid-3): ADDED (new material in rev 2)
      const rev2LineA = mockLines.find(
        (l) => l.revisionId === 'rev-uuid-2' && l.materialId === 'mat-uuid-1',
      )!;
      rev2LineA.consumption = 1.8;

      // Remove Line B from Rev 2
      const lineBIndex = mockLines.findIndex(
        (l) => l.revisionId === 'rev-uuid-2' && l.materialId === 'mat-uuid-2',
      );
      mockLines.splice(lineBIndex, 1);

      // Add Line C to Rev 2
      const lineC = new BomLine();
      lineC.id = 'line-uuid-new-c';
      lineC.revisionId = 'rev-uuid-2';
      lineC.materialId = 'mat-uuid-3';
      lineC.materialNameSnapshot = 'Cúc áo 4 lỗ 18L';
      lineC.materialGroupSnapshot = 'Phụ liệu';
      lineC.unitSnapshot = 'Bộ';
      lineC.consumption = 3;
      lineC.unitCost = 2000;
      lineC.orderIndex = 2;
      mockLines.push(lineC);

      const diff = await service.getRevisionDiff(
        mockBom.id,
        'rev-uuid-2',
        undefined,
        'SA',
      );

      expect(diff.totalChanged).toBe(1);
      expect(diff.totalRemoved).toBe(1);
      expect(diff.totalAdded).toBe(1);
      expect(diff.totalUnchanged).toBe(0);

      const itemA = diff.items.find((it) => it.materialId === 'mat-uuid-1')!;
      expect(itemA.diffType).toBe('CHANGED');
      expect(itemA.changes.consumption.old).toBe(1.5);
      expect(itemA.changes.consumption.new).toBe(1.8);

      const itemB = diff.items.find((it) => it.materialId === 'mat-uuid-2')!;
      expect(itemB.diffType).toBe('REMOVED');
      expect(itemB.oldLine).toBeDefined();
      expect(itemB.newLine).toBeNull();

      const itemC = diff.items.find((it) => it.materialId === 'mat-uuid-3')!;
      expect(itemC.diffType).toBe('ADDED');
      expect(itemC.oldLine).toBeNull();
      expect(itemC.newLine).toBeDefined();
    });

    it('detects UNCHANGED when all fields are identical across revisions', async () => {
      setupRevisionEnv();

      // Create Rev 2 without modifying any lines
      await service.createRevision(
        mockBom.id,
        { reason: 'Unchanged test' },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      const diff = await service.getRevisionDiff(
        mockBom.id,
        'rev-uuid-2',
        undefined,
        'SA',
      );

      expect(diff.totalUnchanged).toBe(2);
      expect(diff.totalAdded).toBe(0);
      expect(diff.totalRemoved).toBe(0);
      expect(diff.totalChanged).toBe(0);
      expect(diff.items.every((it) => it.diffType === 'UNCHANGED')).toBe(true);
    });

    it('detects CHANGED when same materialId has different materialNameSnapshot', async () => {
      setupRevisionEnv();

      await service.createRevision(
        mockBom.id,
        { reason: 'Snapshot diff test' },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      const rev2LineA = mockLines.find(
        (l) => l.revisionId === 'rev-uuid-2' && l.materialId === 'mat-uuid-1',
      )!;
      rev2LineA.materialNameSnapshot = 'Vải Cotton Chải Kỹ 220gsm'; // Updated snapshot

      const diff = await service.getRevisionDiff(
        mockBom.id,
        'rev-uuid-2',
        undefined,
        'SA',
      );

      expect(diff.totalChanged).toBe(1);
      const itemA = diff.items.find((it) => it.materialId === 'mat-uuid-1')!;
      expect(itemA.diffType).toBe('CHANGED');
      expect(itemA.changes.materialNameSnapshot.old).toBe(
        'Vải Cotton 100% 220gsm',
      );
      expect(itemA.changes.materialNameSnapshot.new).toBe(
        'Vải Cotton Chải Kỹ 220gsm',
      );
    });

    it('applies cost masking to revision diff: unitCost and lineCost are null for NVKH and RD', async () => {
      setupRevisionEnv();

      await service.createRevision(
        mockBom.id,
        { reason: 'Diff cost mask test' },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      const diffNVKH = await service.getRevisionDiff(
        mockBom.id,
        'rev-uuid-2',
        undefined,
        UserRoleCode.NVKH,
      );

      expect(diffNVKH.oldCostPerUnit).toBeNull();
      expect(diffNVKH.newCostPerUnit).toBeNull();
      expect(diffNVKH.costDifference).toBeNull();
      expect(diffNVKH.items[0].oldLine?.unitCost).toBeNull();
      expect(diffNVKH.items[0].oldLine?.lineCost).toBeNull();
      expect(diffNVKH.items[0].newLine?.unitCost).toBeNull();
      expect(diffNVKH.items[0].newLine?.lineCost).toBeNull();
    });

    it('rejects diff comparison on Revision 1 without source revision (400 Bad Request)', async () => {
      setupRevisionEnv();

      // Rev 1 has no sourceRevisionId and no compareWithRevisionId
      await expect(
        service.getRevisionDiff(mockBom.id, 'rev-uuid-1', undefined, 'SA'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
