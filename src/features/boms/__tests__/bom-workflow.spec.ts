import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
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
import { assertCanUpdateLine, assertCanAddLine } from '../boms.policy';

describe('BOM V2 Workflow State Machine: Forward, Reject, Approve (PR-04 Specification)', () => {
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
  let materialRepoMock: any;
  let materialGroupRepoMock: any;
  let unitRepoMock: any;
  let dataSourceMock: any;

  // Stateful tracking for workflow tests
  let mockBom: Bom;
  let mockRevision: BomRevision;
  let historyRecords: BomRevisionStatusHistory[];

  function setupStatefulWorkflow(initialStatus = BomRevisionStatus.WAIT_NVKH) {
    mockBom = new Bom();
    mockBom.id = 'bom-wf-uuid-1';
    mockBom.bomCode = 'BOM-FIT-ST001';
    mockBom.bomType = BomType.FIT;
    mockBom.styleId = 'style-1';
    mockBom.purchaseOrderProductId = null;
    mockBom.currentRevisionId = 'rev-wf-uuid-1';
    mockBom.discontinuedAt = null;
    mockBom.rowVersion = 1;
    mockBom.createdAt = new Date('2026-03-01T08:00:00Z');
    mockBom.updatedAt = new Date('2026-03-01T08:00:00Z');

    mockRevision = new BomRevision();
    mockRevision.id = 'rev-wf-uuid-1';
    mockRevision.bomId = mockBom.id;
    mockRevision.revisionNo = 1;
    mockRevision.status = initialStatus;
    mockRevision.approvedBy = null;
    mockRevision.approvedAt = null;
    mockRevision.rowVersion = 1;
    mockRevision.createdAt = new Date('2026-03-01T08:00:00Z');

    historyRecords = [];

    const defaultMockLine = new BomLine();
    defaultMockLine.id = 'line-wf-uuid-1';
    defaultMockLine.revisionId = mockRevision.id;
    defaultMockLine.materialId = 'mat-uuid-1';
    defaultMockLine.materialNameSnapshot = 'Vải chính Cotton 100%';
    defaultMockLine.materialGroupId = 'grp-uuid-1';
    defaultMockLine.materialGroupSnapshot = 'Vải chính';
    defaultMockLine.unitId = 'unit-uuid-1';
    defaultMockLine.unitSnapshot = 'Mét';
    defaultMockLine.consumption = 1.5;
    defaultMockLine.unitCost = 100000;
    defaultMockLine.note = null;
    defaultMockLine.orderIndex = 0;

    dataSourceMock.transaction.mockImplementation(async (cb: any) => {
      const managerMock = {
        findOne: jest.fn().mockImplementation((entityClass, options) => {
          if (entityClass === Bom) {
            if (options?.where?.id === mockBom.id)
              return Promise.resolve(mockBom);
            return Promise.resolve(null);
          }
          if (entityClass === BomRevision) {
            if (options?.where?.id === mockRevision.id)
              return Promise.resolve(mockRevision);
            return Promise.resolve(null);
          }
          return Promise.resolve(null);
        }),
        find: jest.fn().mockImplementation((entityClass) => {
          if (entityClass === BomLine) {
            return Promise.resolve([defaultMockLine]);
          }
          return Promise.resolve([]);
        }),
        create: jest.fn().mockImplementation((entityClass, data) => {
          if (entityClass === BomRevisionStatusHistory) {
            const h = Object.assign(new BomRevisionStatusHistory(), data, {
              id: `hist-uuid-${historyRecords.length + 1}`,
            });
            return h;
          }
          return data;
        }),
        save: jest.fn().mockImplementation((entityClass, entity) => {
          if (
            entityClass === BomRevisionStatusHistory ||
            entity instanceof BomRevisionStatusHistory
          ) {
            historyRecords.push(entity);
          }
          return Promise.resolve(entity);
        }),
      };
      return cb(managerMock);
    });

    bomRepoMock.findOne.mockImplementation(() => Promise.resolve(mockBom));
    bomRevisionRepoMock.findOne.mockImplementation(() =>
      Promise.resolve(mockRevision),
    );
    bomLineRepoMock.find.mockImplementation(() =>
      Promise.resolve([defaultMockLine]),
    );
    bomStatusHistoryRepoMock.find.mockImplementation(() =>
      Promise.resolve(historyRecords),
    );
  }

  beforeEach(async () => {
    bomRepoMock = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };
    bomRevisionRepoMock = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    bomLineRepoMock = {
      find: jest.fn().mockResolvedValue([]),
    };
    bomStatusHistoryRepoMock = {
      find: jest.fn().mockResolvedValue([]),
    };
    styleRepoMock = {
      findOne: jest.fn().mockResolvedValue({
        id: 'style-1',
        styleCode: 'ST001',
        styleName: 'Polo Shirt',
        category: 'Apparel',
      }),
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
    };
    materialRepoMock = {
      findOne: jest.fn(),
    };
    materialGroupRepoMock = {
      findOne: jest.fn(),
    };
    unitRepoMock = {
      findOne: jest.fn(),
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
          useValue: materialRepoMock,
        },
        {
          provide: getRepositoryToken(MaterialGroup),
          useValue: materialGroupRepoMock,
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: unitRepoMock,
        },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get<BomsService>(BomsService);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. FORWARD WORKFLOW & ROLE MATRIX (Section 3, 4, 5, 28)
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Forward Workflow & Role Matrix', () => {
    it('allows N1 (NVKH) to forward wait_nvkh -> wait_rd', async () => {
      setupStatefulWorkflow(BomRevisionStatus.WAIT_NVKH);

      const res = await service.forward(
        mockBom.id,
        { reason: 'NVKH hoàn tất thông tin cơ bản' },
        'user-nvkh-1',
        UserRoleCode.NVKH,
      );

      expect(res.status).toBe(BomRevisionStatus.WAIT_RD);
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_RD);
      expect(historyRecords.length).toBe(1);
      expect(historyRecords[0].oldStatus).toBe(BomRevisionStatus.WAIT_NVKH);
      expect(historyRecords[0].newStatus).toBe(BomRevisionStatus.WAIT_RD);
      expect(historyRecords[0].action).toBe('forward');
      expect(historyRecords[0].reason).toBe('NVKH hoàn tất thông tin cơ bản');
      expect(historyRecords[0].changedBy).toBe('user-nvkh-1');
    });

    it('allows N2 (RD) to forward wait_rd -> wait_tpkh_confirm', async () => {
      setupStatefulWorkflow(BomRevisionStatus.WAIT_RD);

      const res = await service.forward(
        mockBom.id,
        { reason: 'RD hoàn tất định mức mẫu' },
        'user-rd-1',
        UserRoleCode.RD,
      );

      expect(res.status).toBe(BomRevisionStatus.WAIT_TPKH_CONFIRM);
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_TPKH_CONFIRM);
      expect(historyRecords.length).toBe(1);
      expect(historyRecords[0].oldStatus).toBe(BomRevisionStatus.WAIT_RD);
      expect(historyRecords[0].newStatus).toBe(
        BomRevisionStatus.WAIT_TPKH_CONFIRM,
      );
    });

    it('allows N3 (TPKH) to forward wait_tpkh_confirm -> wait_accounting', async () => {
      setupStatefulWorkflow(BomRevisionStatus.WAIT_TPKH_CONFIRM);

      const res = await service.forward(
        mockBom.id,
        { reason: 'TPKH xác nhận thông số kỹ thuật chuẩn' },
        'user-tpkh-1',
        UserRoleCode.TPKH,
      );

      expect(res.status).toBe(BomRevisionStatus.WAIT_ACCOUNTING);
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_ACCOUNTING);
      expect(historyRecords.length).toBe(1);
      expect(historyRecords[0].oldStatus).toBe(
        BomRevisionStatus.WAIT_TPKH_CONFIRM,
      );
      expect(historyRecords[0].newStatus).toBe(
        BomRevisionStatus.WAIT_ACCOUNTING,
      );
    });

    it('allows N4 (ACCOUNTING) to forward wait_accounting -> wait_sa_approve', async () => {
      setupStatefulWorkflow(BomRevisionStatus.WAIT_ACCOUNTING);

      const res = await service.forward(
        mockBom.id,
        { reason: 'Kế toán hoàn tất áp giá vật tư' },
        'user-acct-1',
        UserRoleCode.ACCOUNTING,
      );

      expect(res.status).toBe(BomRevisionStatus.WAIT_SA_APPROVE);
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_SA_APPROVE);
      expect(historyRecords.length).toBe(1);
      expect(historyRecords[0].oldStatus).toBe(
        BomRevisionStatus.WAIT_ACCOUNTING,
      );
      expect(historyRecords[0].newStatus).toBe(
        BomRevisionStatus.WAIT_SA_APPROVE,
      );
    });

    it('rejects forward from wait_sa_approve -> closed (single path: must use approve API)', async () => {
      setupStatefulWorkflow(BomRevisionStatus.WAIT_SA_APPROVE);

      await expect(
        service.forward(
          mockBom.id,
          { reason: 'SA duyệt đóng BOM' },
          'user-sa-1',
          UserRoleCode.SA,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unauthorized roles from forwarding (403 Forbidden)', async () => {
      // NVKH at wait_rd
      setupStatefulWorkflow(BomRevisionStatus.WAIT_RD);
      await expect(
        service.forward(mockBom.id, {}, 'user-nvkh', UserRoleCode.NVKH),
      ).rejects.toThrow(ForbiddenException);

      // RD at wait_nvkh
      setupStatefulWorkflow(BomRevisionStatus.WAIT_NVKH);
      await expect(
        service.forward(mockBom.id, {}, 'user-rd', UserRoleCode.RD),
      ).rejects.toThrow(ForbiddenException);

      // TPKH at wait_rd
      setupStatefulWorkflow(BomRevisionStatus.WAIT_RD);
      await expect(
        service.forward(mockBom.id, {}, 'user-tpkh', UserRoleCode.TPKH),
      ).rejects.toThrow(ForbiddenException);

      // ACCOUNTING at wait_tpkh_confirm
      setupStatefulWorkflow(BomRevisionStatus.WAIT_TPKH_CONFIRM);
      await expect(
        service.forward(mockBom.id, {}, 'user-acct', UserRoleCode.ACCOUNTING),
      ).rejects.toThrow(ForbiddenException);

      // SA at wait_accounting
      setupStatefulWorkflow(BomRevisionStatus.WAIT_ACCOUNTING);
      await expect(
        service.forward(mockBom.id, {}, 'user-sa', UserRoleCode.SA),
      ).rejects.toThrow(ForbiddenException);

      // Anonymous / null role
      setupStatefulWorkflow(BomRevisionStatus.WAIT_NVKH);
      await expect(
        service.forward(mockBom.id, {}, 'user-anon', null as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects forward from closed status (400 Bad Request)', async () => {
      setupStatefulWorkflow(BomRevisionStatus.CLOSED);
      await expect(
        service.forward(mockBom.id, {}, 'user-sa', UserRoleCode.SA),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. REJECT WORKFLOW & REJECT MATRIX (Section 6, 7, 8, 9, 29)
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Reject Workflow & Reject Matrix', () => {
    it('allows N2 (RD) to reject wait_rd -> wait_nvkh', async () => {
      setupStatefulWorkflow(BomRevisionStatus.WAIT_RD);

      const res = await service.reject(
        mockBom.id,
        {
          targetStatus: BomRevisionStatus.WAIT_NVKH,
          reason: 'Thiếu thông tin phân nhóm vật tư',
        },
        'user-rd-1',
        UserRoleCode.RD,
      );

      expect(res.status).toBe(BomRevisionStatus.WAIT_NVKH);
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_NVKH);
      expect(historyRecords.length).toBe(1);
      expect(historyRecords[0].oldStatus).toBe(BomRevisionStatus.WAIT_RD);
      expect(historyRecords[0].newStatus).toBe(BomRevisionStatus.WAIT_NVKH);
      expect(historyRecords[0].action).toBe('reject');
      expect(historyRecords[0].reason).toBe('Thiếu thông tin phân nhóm vật tư');
      expect(historyRecords[0].changedBy).toBe('user-rd-1');
    });

    it('allows N3 (TPKH) to reject wait_tpkh_confirm -> wait_rd and -> wait_nvkh', async () => {
      // N3 -> N2
      setupStatefulWorkflow(BomRevisionStatus.WAIT_TPKH_CONFIRM);
      let res = await service.reject(
        mockBom.id,
        {
          targetStatus: BomRevisionStatus.WAIT_RD,
          reason: 'Định mức vải chính vượt chuẩn 5%',
        },
        'user-tpkh-1',
        UserRoleCode.TPKH,
      );
      expect(res.status).toBe(BomRevisionStatus.WAIT_RD);

      // N3 -> N1
      setupStatefulWorkflow(BomRevisionStatus.WAIT_TPKH_CONFIRM);
      res = await service.reject(
        mockBom.id,
        {
          targetStatus: BomRevisionStatus.WAIT_NVKH,
          reason: 'Yêu cầu NVKH kiểm tra lại tài liệu gốc khách hàng',
        },
        'user-tpkh-1',
        UserRoleCode.TPKH,
      );
      expect(res.status).toBe(BomRevisionStatus.WAIT_NVKH);
    });

    it('allows N4 (ACCOUNTING) to reject wait_accounting -> wait_tpkh_confirm', async () => {
      setupStatefulWorkflow(BomRevisionStatus.WAIT_ACCOUNTING);

      const res = await service.reject(
        mockBom.id,
        {
          targetStatus: BomRevisionStatus.WAIT_TPKH_CONFIRM,
          reason: 'Mã vật tư phụ liệu không tìm thấy bảng giá hợp đồng',
        },
        'user-acct-1',
        UserRoleCode.ACCOUNTING,
      );

      expect(res.status).toBe(BomRevisionStatus.WAIT_TPKH_CONFIRM);
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_TPKH_CONFIRM);
      expect(historyRecords[0].action).toBe('reject');
    });

    it('allows N5 (SA) to reject wait_sa_approve to any previous node (N1, N2, N3, N4)', async () => {
      const targets = [
        BomRevisionStatus.WAIT_ACCOUNTING,
        BomRevisionStatus.WAIT_TPKH_CONFIRM,
        BomRevisionStatus.WAIT_RD,
        BomRevisionStatus.WAIT_NVKH,
      ];

      for (const target of targets) {
        setupStatefulWorkflow(BomRevisionStatus.WAIT_SA_APPROVE);
        const res = await service.reject(
          mockBom.id,
          {
            targetStatus: target,
            reason: `SA trả lại về ${target} để rà soát`,
          },
          'user-sa-1',
          UserRoleCode.SA,
        );
        expect(res.status).toBe(target);
        expect(mockRevision.status).toBe(target);
      }
    });

    it('rejects reject attempts with invalid targets (400 Bad Request)', async () => {
      // N3 -> N4 (future forward node)
      setupStatefulWorkflow(BomRevisionStatus.WAIT_TPKH_CONFIRM);
      await expect(
        service.reject(
          mockBom.id,
          {
            targetStatus: BomRevisionStatus.WAIT_ACCOUNTING,
            reason: 'Invalid target forward',
          },
          'user-tpkh',
          UserRoleCode.TPKH,
        ),
      ).rejects.toThrow(BadRequestException);

      // N4 -> N2 (skipping N3 backwards is forbidden for N4)
      setupStatefulWorkflow(BomRevisionStatus.WAIT_ACCOUNTING);
      await expect(
        service.reject(
          mockBom.id,
          {
            targetStatus: BomRevisionStatus.WAIT_RD,
            reason: 'N4 can only reject to N3',
          },
          'user-acct',
          UserRoleCode.ACCOUNTING,
        ),
      ).rejects.toThrow(BadRequestException);

      // N5 -> closed via reject is forbidden
      setupStatefulWorkflow(BomRevisionStatus.WAIT_SA_APPROVE);
      await expect(
        service.reject(
          mockBom.id,
          {
            targetStatus: BomRevisionStatus.CLOSED,
            reason: 'Cannot reject to closed',
          },
          'user-sa',
          UserRoleCode.SA,
        ),
      ).rejects.toThrow(BadRequestException);

      // N1 -> any reject is forbidden
      setupStatefulWorkflow(BomRevisionStatus.WAIT_NVKH);
      await expect(
        service.reject(
          mockBom.id,
          {
            targetStatus: BomRevisionStatus.WAIT_RD,
            reason: 'N1 has no earlier nodes',
          },
          'user-nvkh',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(BadRequestException);

      // Reject to same status
      setupStatefulWorkflow(BomRevisionStatus.WAIT_RD);
      await expect(
        service.reject(
          mockBom.id,
          {
            targetStatus: BomRevisionStatus.WAIT_RD,
            reason: 'Same status reject',
          },
          'user-rd',
          UserRoleCode.RD,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects reject attempts without mandatory non-empty reason (400 Bad Request)', async () => {
      setupStatefulWorkflow(BomRevisionStatus.WAIT_RD);

      // Empty string
      await expect(
        service.reject(
          mockBom.id,
          {
            targetStatus: BomRevisionStatus.WAIT_NVKH,
            reason: '',
          },
          'user-rd',
          UserRoleCode.RD,
        ),
      ).rejects.toThrow(BadRequestException);

      // Whitespace only
      await expect(
        service.reject(
          mockBom.id,
          {
            targetStatus: BomRevisionStatus.WAIT_NVKH,
            reason: '    ',
          },
          'user-rd',
          UserRoleCode.RD,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unauthorized roles from rejecting (403 Forbidden)', async () => {
      // NVKH at wait_rd
      setupStatefulWorkflow(BomRevisionStatus.WAIT_RD);
      await expect(
        service.reject(
          mockBom.id,
          {
            targetStatus: BomRevisionStatus.WAIT_NVKH,
            reason: 'Valid reason',
          },
          'user-nvkh',
          UserRoleCode.NVKH,
        ),
      ).rejects.toThrow(ForbiddenException);

      // RD at wait_tpkh_confirm
      setupStatefulWorkflow(BomRevisionStatus.WAIT_TPKH_CONFIRM);
      await expect(
        service.reject(
          mockBom.id,
          {
            targetStatus: BomRevisionStatus.WAIT_RD,
            reason: 'Valid reason',
          },
          'user-rd',
          UserRoleCode.RD,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. APPROVE WORKFLOW & PERMISSIONS (Section 12, 13)
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Approve Workflow & Permissions', () => {
    it('allows SA to approve BOM at wait_sa_approve -> closed with approvedBy and approvedAt', async () => {
      setupStatefulWorkflow(BomRevisionStatus.WAIT_SA_APPROVE);

      const res = await service.approve(
        mockBom.id,
        { reason: 'Phê duyệt ban hành BOM sản xuất chính thức' },
        'user-sa-uuid',
        UserRoleCode.SA,
      );

      expect(res.status).toBe(BomRevisionStatus.CLOSED);
      expect(mockRevision.status).toBe(BomRevisionStatus.CLOSED);
      expect(mockRevision.approvedBy).toBe('user-sa-uuid');
      expect(mockRevision.approvedAt).toBeInstanceOf(Date);
      expect(historyRecords.length).toBe(1);
      expect(historyRecords[0].oldStatus).toBe(
        BomRevisionStatus.WAIT_SA_APPROVE,
      );
      expect(historyRecords[0].newStatus).toBe(BomRevisionStatus.CLOSED);
      expect(historyRecords[0].action).toBe('approve');
      expect(historyRecords[0].reason).toBe(
        'Phê duyệt ban hành BOM sản xuất chính thức',
      );
      expect(historyRecords[0].changedBy).toBe('user-sa-uuid');
    });

    it('rejects approve by non-SA roles (403 Forbidden)', async () => {
      setupStatefulWorkflow(BomRevisionStatus.WAIT_SA_APPROVE);

      const nonSaRoles = [
        UserRoleCode.NVKH,
        UserRoleCode.RD,
        UserRoleCode.TPKH,
        UserRoleCode.ACCOUNTING,
      ];

      for (const role of nonSaRoles) {
        await expect(
          service.approve(mockBom.id, {}, 'user-other', role),
        ).rejects.toThrow(ForbiddenException);
      }
    });

    it('rejects approve when revision is not in wait_sa_approve (400 Bad Request)', async () => {
      const prematureStatuses = [
        BomRevisionStatus.WAIT_NVKH,
        BomRevisionStatus.WAIT_RD,
        BomRevisionStatus.WAIT_TPKH_CONFIRM,
        BomRevisionStatus.WAIT_ACCOUNTING,
      ];

      for (const status of prematureStatuses) {
        setupStatefulWorkflow(status);
        await expect(
          service.approve(mockBom.id, {}, 'user-sa', UserRoleCode.SA),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects approve when BOM is already closed (400 Bad Request)', async () => {
      setupStatefulWorkflow(BomRevisionStatus.CLOSED);
      await expect(
        service.approve(mockBom.id, {}, 'user-sa', UserRoleCode.SA),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. DISCONTINUED & CLOSED LOCK INTEGRATION (Section 13, 14, 27)
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Discontinued & Closed Locks', () => {
    it('rejects forward, reject, and approve on discontinued BOM (400 Bad Request)', async () => {
      setupStatefulWorkflow(BomRevisionStatus.WAIT_RD);
      mockBom.discontinuedAt = new Date('2026-03-05T00:00:00Z');

      // Forward
      await expect(
        service.forward(mockBom.id, {}, 'user-rd', UserRoleCode.RD),
      ).rejects.toThrow(BadRequestException);

      // Reject
      await expect(
        service.reject(
          mockBom.id,
          { targetStatus: BomRevisionStatus.WAIT_NVKH, reason: 'Test' },
          'user-rd',
          UserRoleCode.RD,
        ),
      ).rejects.toThrow(BadRequestException);

      // Approve
      await expect(
        service.approve(mockBom.id, {}, 'user-sa', UserRoleCode.SA),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects forward, reject, and approve on closed BOM (400 Bad Request)', async () => {
      setupStatefulWorkflow(BomRevisionStatus.CLOSED);

      // Forward
      await expect(
        service.forward(mockBom.id, {}, 'user-sa', UserRoleCode.SA),
      ).rejects.toThrow(BadRequestException);

      // Reject
      await expect(
        service.reject(
          mockBom.id,
          { targetStatus: BomRevisionStatus.WAIT_SA_APPROVE, reason: 'Test' },
          'user-sa',
          UserRoleCode.SA,
        ),
      ).rejects.toThrow(BadRequestException);

      // Approve
      await expect(
        service.approve(mockBom.id, {}, 'user-sa', UserRoleCode.SA),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when BOM does not exist (404)', async () => {
      setupStatefulWorkflow();
      await expect(
        service.forward('non-existent-bom', {}, 'user-nvkh', UserRoleCode.NVKH),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.reject(
          'non-existent-bom',
          { targetStatus: BomRevisionStatus.WAIT_NVKH, reason: 'Not found' },
          'user-rd',
          UserRoleCode.RD,
        ),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.approve('non-existent-bom', {}, 'user-sa', UserRoleCode.SA),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. FULL E2E FORWARD WORKFLOW TEST (Section 30)
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. Full E2E Forward Workflow (Section 30 Scenario)', () => {
    it('executes full sequential forward flow: N1 -> N2 -> N3 -> N4 -> N5 -> closed with 5 history logs', async () => {
      setupStatefulWorkflow(BomRevisionStatus.WAIT_NVKH);
      const originalRevId = mockRevision.id;
      const originalRevNo = mockRevision.revisionNo;

      // 1. N1 (NVKH) forward -> wait_rd
      await service.forward(
        mockBom.id,
        { reason: 'Step 1: NVKH forward' },
        'user-nvkh',
        UserRoleCode.NVKH,
      );
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_RD);

      // 2. N2 (RD) forward -> wait_tpkh_confirm
      await service.forward(
        mockBom.id,
        { reason: 'Step 2: RD forward' },
        'user-rd',
        UserRoleCode.RD,
      );
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_TPKH_CONFIRM);

      // 3. N3 (TPKH) forward -> wait_accounting
      await service.forward(
        mockBom.id,
        { reason: 'Step 3: TPKH forward' },
        'user-tpkh',
        UserRoleCode.TPKH,
      );
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_ACCOUNTING);

      // 4. N4 (ACCOUNTING) forward -> wait_sa_approve
      await service.forward(
        mockBom.id,
        { reason: 'Step 4: ACCOUNTING forward' },
        'user-acct',
        UserRoleCode.ACCOUNTING,
      );
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_SA_APPROVE);

      // 5. N5 (SA) approve -> closed
      const finalBom = await service.approve(
        mockBom.id,
        { reason: 'Step 5: SA approve closed' },
        'user-sa',
        UserRoleCode.SA,
      );

      // Verify End State
      expect(finalBom.status).toBe(BomRevisionStatus.CLOSED);
      expect(mockRevision.status).toBe(BomRevisionStatus.CLOSED);
      expect(mockRevision.id).toBe(originalRevId); // Invariant: same revision
      expect(mockRevision.revisionNo).toBe(originalRevNo); // Invariant: rev 1
      expect(mockBom.currentRevisionId).toBe(originalRevId); // Invariant: no change

      // Verify 5 History records
      expect(historyRecords.length).toBe(5);

      expect(historyRecords[0].oldStatus).toBe(BomRevisionStatus.WAIT_NVKH);
      expect(historyRecords[0].newStatus).toBe(BomRevisionStatus.WAIT_RD);
      expect(historyRecords[0].action).toBe('forward');

      expect(historyRecords[1].oldStatus).toBe(BomRevisionStatus.WAIT_RD);
      expect(historyRecords[1].newStatus).toBe(
        BomRevisionStatus.WAIT_TPKH_CONFIRM,
      );
      expect(historyRecords[1].action).toBe('forward');

      expect(historyRecords[2].oldStatus).toBe(
        BomRevisionStatus.WAIT_TPKH_CONFIRM,
      );
      expect(historyRecords[2].newStatus).toBe(
        BomRevisionStatus.WAIT_ACCOUNTING,
      );
      expect(historyRecords[2].action).toBe('forward');

      expect(historyRecords[3].oldStatus).toBe(
        BomRevisionStatus.WAIT_ACCOUNTING,
      );
      expect(historyRecords[3].newStatus).toBe(
        BomRevisionStatus.WAIT_SA_APPROVE,
      );
      expect(historyRecords[3].action).toBe('forward');

      expect(historyRecords[4].oldStatus).toBe(
        BomRevisionStatus.WAIT_SA_APPROVE,
      );
      expect(historyRecords[4].newStatus).toBe(BomRevisionStatus.CLOSED);
      expect(historyRecords[4].action).toBe('approve');
      expect(historyRecords[4].reason).toBe('Step 5: SA approve closed');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. FULL E2E REJECT & CORRECTION WORKFLOW (Section 31)
  // ──────────────────────────────────────────────────────────────────────────
  describe('6. Full E2E Reject & Correction Workflow (Section 31 Scenario)', () => {
    it('executes complex forward-reject multi-cycle preserving revision identity throughout', async () => {
      setupStatefulWorkflow(BomRevisionStatus.WAIT_NVKH);
      const originalRevId = mockRevision.id;
      const originalRevNo = mockRevision.revisionNo;

      // N1 -> N2
      await service.forward(mockBom.id, {}, 'user-nvkh', UserRoleCode.NVKH);
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_RD);

      // N2 reject -> N1
      await service.reject(
        mockBom.id,
        {
          targetStatus: BomRevisionStatus.WAIT_NVKH,
          reason: 'Reject 1: to N1',
        },
        'user-rd',
        UserRoleCode.RD,
      );
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_NVKH);

      // N1 -> N2
      await service.forward(mockBom.id, {}, 'user-nvkh', UserRoleCode.NVKH);
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_RD);

      // N2 -> N3
      await service.forward(mockBom.id, {}, 'user-rd', UserRoleCode.RD);
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_TPKH_CONFIRM);

      // N3 reject -> N1
      await service.reject(
        mockBom.id,
        {
          targetStatus: BomRevisionStatus.WAIT_NVKH,
          reason: 'Reject 2: to N1',
        },
        'user-tpkh',
        UserRoleCode.TPKH,
      );
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_NVKH);

      // N1 -> N2
      await service.forward(mockBom.id, {}, 'user-nvkh', UserRoleCode.NVKH);
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_RD);

      // N2 -> N3
      await service.forward(mockBom.id, {}, 'user-rd', UserRoleCode.RD);
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_TPKH_CONFIRM);

      // N3 reject -> N2
      await service.reject(
        mockBom.id,
        { targetStatus: BomRevisionStatus.WAIT_RD, reason: 'Reject 3: to N2' },
        'user-tpkh',
        UserRoleCode.TPKH,
      );
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_RD);

      // N2 -> N3
      await service.forward(mockBom.id, {}, 'user-rd', UserRoleCode.RD);
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_TPKH_CONFIRM);

      // N3 -> N4
      await service.forward(mockBom.id, {}, 'user-tpkh', UserRoleCode.TPKH);
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_ACCOUNTING);

      // N4 reject -> N3
      await service.reject(
        mockBom.id,
        {
          targetStatus: BomRevisionStatus.WAIT_TPKH_CONFIRM,
          reason: 'Reject 4: to N3',
        },
        'user-acct',
        UserRoleCode.ACCOUNTING,
      );
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_TPKH_CONFIRM);

      // N3 -> N4
      await service.forward(mockBom.id, {}, 'user-tpkh', UserRoleCode.TPKH);
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_ACCOUNTING);

      // N4 -> N5
      await service.forward(
        mockBom.id,
        {},
        'user-acct',
        UserRoleCode.ACCOUNTING,
      );
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_SA_APPROVE);

      // N5 reject -> N2
      await service.reject(
        mockBom.id,
        {
          targetStatus: BomRevisionStatus.WAIT_RD,
          reason: 'Reject 5: SA to N2',
        },
        'user-sa',
        UserRoleCode.SA,
      );
      expect(mockRevision.status).toBe(BomRevisionStatus.WAIT_RD);

      // Verify Invariants after 14 workflow transitions:
      expect(mockRevision.id).toBe(originalRevId);
      expect(mockRevision.revisionNo).toBe(originalRevNo);
      expect(mockBom.currentRevisionId).toBe(originalRevId);

      // Verify total 14 transitions recorded with accurate reasons
      expect(historyRecords.length).toBe(14);
      const rejectHistories = historyRecords.filter(
        (h) => h.action === 'reject',
      );
      expect(rejectHistories.length).toBe(5);
      expect(rejectHistories[0].reason).toBe('Reject 1: to N1');
      expect(rejectHistories[1].reason).toBe('Reject 2: to N1');
      expect(rejectHistories[2].reason).toBe('Reject 3: to N2');
      expect(rejectHistories[3].reason).toBe('Reject 4: to N3');
      expect(rejectHistories[4].reason).toBe('Reject 5: SA to N2');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. ROLE MUTATION BOUNDARIES (Section 22, 23, 24)
  // ──────────────────────────────────────────────────────────────────────────
  describe('7. Role Mutation Boundaries (Section 22, 23, 24)', () => {
    it('confirms N3 (TPKH) can edit technical line fields in wait_tpkh_confirm, but not unitCost', () => {
      setupStatefulWorkflow(BomRevisionStatus.WAIT_TPKH_CONFIRM);

      // TPKH updating technical fields: allowed
      expect(() => {
        assertCanUpdateLine(UserRoleCode.TPKH, mockBom, mockRevision, {
          consumption: 1.85,
          note: 'Điều chỉnh định mức sau giác mẫu kỹ thuật',
        });
      }).not.toThrow();

      // TPKH updating unitCost: forbidden
      expect(() => {
        assertCanUpdateLine(UserRoleCode.TPKH, mockBom, mockRevision, {
          unitCost: 150000,
        });
      }).toThrow(ForbiddenException);
    });

    it('confirms N4 (ACCOUNTING) can edit unitCost in wait_accounting, but not technical fields', () => {
      setupStatefulWorkflow(BomRevisionStatus.WAIT_ACCOUNTING);

      // ACCOUNTING updating unitCost: allowed
      expect(() => {
        assertCanUpdateLine(UserRoleCode.ACCOUNTING, mockBom, mockRevision, {
          unitCost: 145000,
        });
      }).not.toThrow();

      // ACCOUNTING updating consumption: forbidden
      expect(() => {
        assertCanUpdateLine(UserRoleCode.ACCOUNTING, mockBom, mockRevision, {
          consumption: 2.0,
        });
      }).toThrow(ForbiddenException);
    });

    it('confirms N5 (SA) cannot edit lines in wait_sa_approve (read-only node)', () => {
      setupStatefulWorkflow(BomRevisionStatus.WAIT_SA_APPROVE);

      // SA updating line: forbidden
      expect(() => {
        assertCanUpdateLine(UserRoleCode.SA, mockBom, mockRevision, {
          consumption: 1.0,
        });
      }).toThrow(ForbiddenException);

      // SA adding line: forbidden
      expect(() => {
        assertCanAddLine(UserRoleCode.SA, mockBom, mockRevision);
      }).toThrow(ForbiddenException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. CODE REVIEW REGRESSION TEST SUITE (6 Invariants)
  // ──────────────────────────────────────────────────────────────────────────
  describe('8. Code Review Regression Test Suite (6 Invariants)', () => {
    describe('Invariant 1: Data-Readiness Validation on Forward & Approve', () => {
      it('rejects forward when revision has 0 lines (empty BOM)', async () => {
        setupStatefulWorkflow(BomRevisionStatus.WAIT_NVKH);
        dataSourceMock.transaction.mockImplementation(async (cb: any) => {
          const managerMock = {
            findOne: jest.fn().mockImplementation((entityClass) => {
              if (entityClass === Bom) return Promise.resolve(mockBom);
              if (entityClass === BomRevision)
                return Promise.resolve(mockRevision);
              return Promise.resolve(null);
            }),
            find: jest.fn().mockImplementation((entityClass) => {
              if (entityClass === BomLine) return Promise.resolve([]); // EMPTY LINES
              return Promise.resolve([]);
            }),
          };
          return cb(managerMock);
        });

        await expect(
          service.forward(mockBom.id, {}, 'user-nvkh', UserRoleCode.NVKH),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects forward when line is missing materialNameSnapshot or unitSnapshot', async () => {
        setupStatefulWorkflow(BomRevisionStatus.WAIT_NVKH);
        const badLine = new BomLine();
        badLine.orderIndex = 0;
        badLine.materialNameSnapshot = ''; // INVALID SNAPSHOT
        badLine.unitSnapshot = 'Mét';
        badLine.consumption = 1.0;

        dataSourceMock.transaction.mockImplementation(async (cb: any) => {
          const managerMock = {
            findOne: jest.fn().mockImplementation((entityClass) => {
              if (entityClass === Bom) return Promise.resolve(mockBom);
              if (entityClass === BomRevision)
                return Promise.resolve(mockRevision);
              return Promise.resolve(null);
            }),
            find: jest.fn().mockImplementation((entityClass) => {
              if (entityClass === BomLine) return Promise.resolve([badLine]);
              return Promise.resolve([]);
            }),
          };
          return cb(managerMock);
        });

        await expect(
          service.forward(mockBom.id, {}, 'user-nvkh', UserRoleCode.NVKH),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects forward from N2 (WAIT_RD) if any line has consumption <= 0', async () => {
        setupStatefulWorkflow(BomRevisionStatus.WAIT_RD);
        const zeroConsumptionLine = new BomLine();
        zeroConsumptionLine.orderIndex = 0;
        zeroConsumptionLine.materialNameSnapshot = 'Vải chính';
        zeroConsumptionLine.unitSnapshot = 'Mét';
        zeroConsumptionLine.consumption = 0; // ZERO CONSUMPTION

        dataSourceMock.transaction.mockImplementation(async (cb: any) => {
          const managerMock = {
            findOne: jest.fn().mockImplementation((entityClass) => {
              if (entityClass === Bom) return Promise.resolve(mockBom);
              if (entityClass === BomRevision)
                return Promise.resolve(mockRevision);
              return Promise.resolve(null);
            }),
            find: jest.fn().mockImplementation((entityClass) => {
              if (entityClass === BomLine)
                return Promise.resolve([zeroConsumptionLine]);
              return Promise.resolve([]);
            }),
          };
          return cb(managerMock);
        });

        await expect(
          service.forward(mockBom.id, {}, 'user-rd', UserRoleCode.RD),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects forward from N4 (WAIT_ACCOUNTING) if any line has unitCost null or < 0', async () => {
        setupStatefulWorkflow(BomRevisionStatus.WAIT_ACCOUNTING);
        const noCostLine = new BomLine();
        noCostLine.orderIndex = 0;
        noCostLine.materialNameSnapshot = 'Vải chính';
        noCostLine.unitSnapshot = 'Mét';
        noCostLine.consumption = 1.5;
        noCostLine.unitCost = null; // UNPRICED

        dataSourceMock.transaction.mockImplementation(async (cb: any) => {
          const managerMock = {
            findOne: jest.fn().mockImplementation((entityClass) => {
              if (entityClass === Bom) return Promise.resolve(mockBom);
              if (entityClass === BomRevision)
                return Promise.resolve(mockRevision);
              return Promise.resolve(null);
            }),
            find: jest.fn().mockImplementation((entityClass) => {
              if (entityClass === BomLine) return Promise.resolve([noCostLine]);
              return Promise.resolve([]);
            }),
          };
          return cb(managerMock);
        });

        await expect(
          service.forward(mockBom.id, {}, 'user-acct', UserRoleCode.ACCOUNTING),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects approve at N5 if any line has unitCost null or consumption <= 0', async () => {
        setupStatefulWorkflow(BomRevisionStatus.WAIT_SA_APPROVE);
        const invalidLine = new BomLine();
        invalidLine.orderIndex = 0;
        invalidLine.materialNameSnapshot = 'Vải chính';
        invalidLine.unitSnapshot = 'Mét';
        invalidLine.consumption = 0;
        invalidLine.unitCost = null;

        dataSourceMock.transaction.mockImplementation(async (cb: any) => {
          const managerMock = {
            findOne: jest.fn().mockImplementation((entityClass) => {
              if (entityClass === Bom) return Promise.resolve(mockBom);
              if (entityClass === BomRevision)
                return Promise.resolve(mockRevision);
              return Promise.resolve(null);
            }),
            find: jest.fn().mockImplementation((entityClass) => {
              if (entityClass === BomLine)
                return Promise.resolve([invalidLine]);
              return Promise.resolve([]);
            }),
          };
          return cb(managerMock);
        });

        await expect(
          service.approve(mockBom.id, {}, 'user-sa', UserRoleCode.SA),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('Invariant 2: State-Based Line Mutation Permissions', () => {
      it('confirms NVKH cannot add lines in N2 (wait_rd)', () => {
        setupStatefulWorkflow(BomRevisionStatus.WAIT_RD);
        expect(() => {
          assertCanAddLine(UserRoleCode.NVKH, mockBom, mockRevision);
        }).toThrow(ForbiddenException);
      });

      it('confirms RD cannot add lines in N1 (wait_nvkh)', () => {
        setupStatefulWorkflow(BomRevisionStatus.WAIT_NVKH);
        expect(() => {
          assertCanAddLine(UserRoleCode.RD, mockBom, mockRevision);
        }).toThrow(ForbiddenException);
      });

      it('confirms ACCOUNTING cannot update unitCost in N1 (wait_nvkh)', () => {
        setupStatefulWorkflow(BomRevisionStatus.WAIT_NVKH);
        expect(() => {
          assertCanUpdateLine(UserRoleCode.ACCOUNTING, mockBom, mockRevision, {
            unitCost: 100000,
          });
        }).toThrow(ForbiddenException);
      });

      it('confirms all roles cannot mutate lines in wait_sa_approve (read-only)', () => {
        setupStatefulWorkflow(BomRevisionStatus.WAIT_SA_APPROVE);
        const roles = [
          UserRoleCode.NVKH,
          UserRoleCode.RD,
          UserRoleCode.TPKH,
          UserRoleCode.ACCOUNTING,
          UserRoleCode.SA,
        ];
        for (const r of roles) {
          expect(() => {
            assertCanAddLine(r, mockBom, mockRevision);
          }).toThrow(ForbiddenException);
        }
      });
    });

    describe('Invariant 6: Disallow Header Editing on Closed and wait_sa_approve Revisions', () => {
      it('rejects header update when current revision is CLOSED', async () => {
        mockRevision.status = BomRevisionStatus.CLOSED;
        bomRepoMock.findOne.mockResolvedValue(mockBom);
        bomRevisionRepoMock.findOne.mockResolvedValue(mockRevision);

        await expect(
          service.update(
            mockBom.id,
            { deadline: '2026-12-31' },
            'user-tpkh',
            UserRoleCode.TPKH,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects header update when current revision is WAIT_SA_APPROVE', async () => {
        mockRevision.status = BomRevisionStatus.WAIT_SA_APPROVE;
        bomRepoMock.findOne.mockResolvedValue(mockBom);
        bomRevisionRepoMock.findOne.mockResolvedValue(mockRevision);

        await expect(
          service.update(
            mockBom.id,
            { deadline: '2026-12-31' },
            'user-tpkh',
            UserRoleCode.TPKH,
          ),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });
});
