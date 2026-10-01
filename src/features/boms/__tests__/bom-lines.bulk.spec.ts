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
import { Material } from '../../master-data/entities/Material.entity';
import { MaterialGroup } from '../../master-data/entities/MaterialGroup.entity';
import { Unit } from '../../master-data/entities/Unit.entity';
import {
  BomRevisionStatus,
  BomType,
} from '../../../common/enums/database.enums';
import { createBomAuditServiceMock } from './bom-audit.mock';

describe('BOM bulk line save, cost save and promote', () => {
  let service: BomsService;
  let audit: ReturnType<typeof createBomAuditServiceMock>;
  let manager: any;
  let bom: Bom;
  let revs: BomRevision[];
  let lines: BomLine[];

  const makeLine = (id: string, materialId: string, orderIndex: number) =>
    Object.assign(new BomLine(), {
      id,
      revisionId: 'rev-1',
      materialId,
      materialNameSnapshot: `Vật tư ${id}`,
      materialGroupId: null,
      materialGroupSnapshot: null,
      unitId: null,
      unitSnapshot: 'm',
      consumption: '1.000000',
      unitCost: null,
      note: null,
      orderIndex,
    });

  const makeRev = (id: string, revisionNo: number, status: BomRevisionStatus) =>
    Object.assign(new BomRevision(), {
      id,
      bomId: 'bom-1',
      revisionNo,
      status,
      rowVersion: 4,
    });

  const materials = [
    Object.assign(new Material(), {
      id: 'mD',
      materialName: 'Vật tư D',
      materialGroupId: null,
      defaultUnitId: null,
    }),
  ];

  beforeEach(() => {
    bom = Object.assign(new Bom(), {
      id: 'bom-1',
      bomCode: 'BOM-FIT-1',
      bomType: BomType.FIT,
      currentRevisionId: 'rev-1',
      discontinuedAt: null,
      purchaseOrderProductId: null,
      rowVersion: 7,
    });
    revs = [
      makeRev('rev-1', 2, BomRevisionStatus.WAIT_NVKH),
      makeRev('rev-0', 1, BomRevisionStatus.CLOSED),
    ];
    lines = [makeLine('A', 'mA', 0), makeLine('B', 'mB', 1)];

    manager = {
      findOne: jest.fn((entity: unknown, options: any) => {
        if (entity === Bom) return Promise.resolve(bom);
        if (entity === BomRevision) {
          return Promise.resolve(
            revs.find((r) => r.id === options.where.id) ?? null,
          );
        }
        return Promise.resolve(null);
      }),
      find: jest.fn((entity: unknown) => {
        if (entity === BomLine) return Promise.resolve([...lines]);
        if (entity === Material) return Promise.resolve(materials);
        if (entity === MaterialGroup || entity === Unit) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      }),
      create: jest.fn((_entity: unknown, data: object) =>
        Object.assign(new BomLine(), data, { id: 'new-1' }),
      ),
      save: jest.fn((_entity: unknown, data: unknown) => Promise.resolve(data)),
      delete: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
    };
    audit = createBomAuditServiceMock();
    const repo = {} as any;
    service = new BomsService(
      repo,
      repo,
      repo,
      repo,
      repo,
      repo,
      repo,
      repo,
      repo,
      new BomCostService(repo, repo, repo),
      audit as any,
      dataSource as any,
    );
  });

  describe('saveLines', () => {
    it('returns the current table untouched when nothing changed', async () => {
      const res = await service.saveLines(
        'bom-1',
        {
          lines: [
            { lineId: 'A', consumption: 1 },
            { lineId: 'B', consumption: 1 },
          ],
        },
        'u1',
        'NVKH',
      );

      expect(res.lines).toHaveLength(2);
      expect(res.rowVersion).toBe(4);
      expect(manager.save).not.toHaveBeenCalled();
      expect(audit.recordLinesSaved).not.toHaveBeenCalled();
    });

    it('lets TPKH add, edit and delete at wait_nvkh in one save, bumping versions once', async () => {
      const res = await service.saveLines(
        'bom-1',
        {
          lines: [
            { lineId: 'A', consumption: 3 },
            { materialId: 'mD', consumption: 2 },
          ],
        },
        'u-tpkh',
        'TPKH',
      );

      expect(manager.delete).toHaveBeenCalledTimes(1);
      expect(manager.update).toHaveBeenCalledWith(
        BomLine,
        { id: 'A' },
        { consumption: 3 },
      );
      expect(manager.create).toHaveBeenCalledTimes(1);
      expect(res.rowVersion).toBe(5);
      expect(bom.rowVersion).toBe(8);
      expect(bom.updatedBy).toBe('u-tpkh');
      expect(audit.recordLinesSaved).toHaveBeenCalledTimes(1);
      expect(audit.recordLinesSaved.mock.calls[0][4]).toBe(false);
    });

    it('rejects RD adding a line at wait_nvkh', async () => {
      await expect(
        service.saveLines(
          'bom-1',
          {
            lines: [
              { lineId: 'A' },
              { lineId: 'B' },
              { materialId: 'mD', consumption: 1 },
            ],
          },
          'u-rd',
          'RD',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(manager.create).not.toHaveBeenCalled();
    });

    it('rejects technical edits at wait_accounting', async () => {
      revs[0].status = BomRevisionStatus.WAIT_ACCOUNTING;
      await expect(
        service.saveLines(
          'bom-1',
          { lines: [{ lineId: 'A', consumption: 9 }, { lineId: 'B' }] },
          'u-acc',
          'ACCOUNTING',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('still saves with a stale expectedRowVersion and flags the overwrite in the audit', async () => {
      await service.saveLines(
        'bom-1',
        {
          expectedRowVersion: 1,
          lines: [{ lineId: 'A', consumption: 3 }, { lineId: 'B' }],
        },
        'u1',
        'NVKH',
      );

      expect(manager.update).toHaveBeenCalled();
      expect(audit.recordLinesSaved.mock.calls[0][4]).toBe(true);
    });

    it('rejects a closed revision', async () => {
      revs[0].status = BomRevisionStatus.CLOSED;
      await expect(
        service.saveLines(
          'bom-1',
          { lines: [{ lineId: 'A', consumption: 9 }, { lineId: 'B' }] },
          'u1',
          'NVKH',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('reports a missing material', async () => {
      manager.find.mockImplementation((entity: unknown) =>
        Promise.resolve(entity === BomLine ? [...lines] : []),
      );
      await expect(
        service.saveLines(
          'bom-1',
          {
            lines: [
              { lineId: 'A' },
              { lineId: 'B' },
              { materialId: 'mD', consumption: 1 },
            ],
          },
          'u1',
          'NVKH',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('saveCosts', () => {
    beforeEach(() => {
      revs[0].status = BomRevisionStatus.WAIT_ACCOUNTING;
    });

    it('lets ACCOUNTING save prices of changed lines only', async () => {
      lines[1].unitCost = 5000 as any;
      const res = await service.saveCosts(
        'bom-1',
        {
          items: [
            { lineId: 'A', unitCost: 1200 },
            { lineId: 'B', unitCost: 5000 },
          ],
        },
        'u-acc',
        'ACCOUNTING',
      );

      expect(manager.query).toHaveBeenCalledTimes(1);
      const params = manager.query.mock.calls[0][1];
      expect(params).toEqual(['rev-1', 'A', 1200]);
      expect(res.rowVersion).toBe(5);
      const changes = audit.recordCostsSaved.mock.calls[0][3];
      expect(changes).toEqual([
        { fieldName: 'Vật tư A [A]::unitCost', oldValue: null, newValue: 1200 },
      ]);
    });

    it('keeps distinct line identities when two material names match', async () => {
      lines[0].materialNameSnapshot = 'Vải::chính';
      lines[1].materialNameSnapshot = 'Vải::chính';
      await service.saveCosts(
        'bom-1',
        {
          items: [
            { lineId: 'A', unitCost: 1200 },
            { lineId: 'B', unitCost: 1300 },
          ],
        },
        'u-acc',
        'ACCOUNTING',
      );

      expect(audit.recordCostsSaved.mock.calls[0][3]).toEqual([
        {
          fieldName: 'Vải::chính [A]::unitCost',
          oldValue: null,
          newValue: 1200,
        },
        {
          fieldName: 'Vải::chính [B]::unitCost',
          oldValue: null,
          newValue: 1300,
        },
      ]);
    });

    it('does nothing when no price changed', async () => {
      await service.saveCosts(
        'bom-1',
        { items: [{ lineId: 'A', unitCost: null }] },
        'u-acc',
        'ACCOUNTING',
      );
      expect(manager.query).not.toHaveBeenCalled();
      expect(audit.recordCostsSaved).not.toHaveBeenCalled();
    });

    it('rejects non-accounting roles and other statuses', async () => {
      await expect(
        service.saveCosts(
          'bom-1',
          { items: [{ lineId: 'A', unitCost: 10 }] },
          'u1',
          'TPKH',
        ),
      ).rejects.toThrow(ForbiddenException);

      revs[0].status = BomRevisionStatus.WAIT_RD;
      await expect(
        service.saveCosts(
          'bom-1',
          { items: [{ lineId: 'A', unitCost: 10 }] },
          'u-acc',
          'ACCOUNTING',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects lines outside the current revision and repeated ids', async () => {
      await expect(
        service.saveCosts(
          'bom-1',
          { items: [{ lineId: 'X', unitCost: 10 }] },
          'u-acc',
          'ACCOUNTING',
        ),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.saveCosts(
          'bom-1',
          {
            items: [
              { lineId: 'A', unitCost: 10 },
              { lineId: 'A', unitCost: 11 },
            ],
          },
          'u-acc',
          'ACCOUNTING',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('promoteRevision', () => {
    beforeEach(() => {
      jest.spyOn(service, 'findOne').mockResolvedValue({} as any);
    });

    it('lets SA point the BOM back to an older revision without touching other revisions', async () => {
      await service.promoteRevision(
        'bom-1',
        'rev-0',
        { reason: 'Bản 2 sai định mức' },
        'u-sa',
        'SA',
      );

      expect(bom.currentRevisionId).toBe('rev-0');
      expect(bom.rowVersion).toBe(8);
      expect(manager.delete).not.toHaveBeenCalled();
      expect(audit.recordPromote).toHaveBeenCalledWith(
        manager,
        { id: 'u-sa', roleCode: 'SA' },
        bom,
        2,
        1,
        'Bản 2 sai định mức',
      );
    });

    it('works even when the current revision is still in progress', async () => {
      revs[0].status = BomRevisionStatus.WAIT_ACCOUNTING;
      await service.promoteRevision(
        'bom-1',
        'rev-0',
        { reason: 'x' },
        'u',
        'SA',
      );
      expect(bom.currentRevisionId).toBe('rev-0');
    });

    it('rejects everyone except SA', async () => {
      await expect(
        service.promoteRevision('bom-1', 'rev-0', { reason: 'x' }, 'u', 'TPKH'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects promoting the current revision, a foreign revision or a discontinued BOM', async () => {
      await expect(
        service.promoteRevision('bom-1', 'rev-1', { reason: 'x' }, 'u', 'SA'),
      ).rejects.toThrow(BadRequestException);

      revs.push(
        Object.assign(makeRev('rev-x', 1, BomRevisionStatus.CLOSED), {
          bomId: 'other-bom',
        }),
      );
      await expect(
        service.promoteRevision('bom-1', 'rev-x', { reason: 'x' }, 'u', 'SA'),
      ).rejects.toThrow(NotFoundException);

      bom.discontinuedAt = new Date();
      await expect(
        service.promoteRevision('bom-1', 'rev-0', { reason: 'x' }, 'u', 'SA'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
