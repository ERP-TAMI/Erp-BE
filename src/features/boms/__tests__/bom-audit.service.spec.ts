import { AuditEventType } from '../../../common/enums/database.enums';
import { BomAuditService } from '../bom-audit.service';

describe('BomAuditService', () => {
  const recordEntityChange = jest.fn().mockResolvedValue(undefined);
  const service = new BomAuditService({ recordEntityChange } as any);
  const manager = {} as any;
  const actor = { id: 'u1', roleCode: 'TPKH' };
  const revision = { id: 'rev-1', revisionNo: 2 };

  beforeEach(() => recordEntityChange.mockClear());

  it('describes a workflow move with readable status names and the note', async () => {
    await service.recordWorkflow(
      manager,
      actor,
      revision,
      'reject',
      'wait_rd',
      'wait_nvkh',
      '  thiếu vật tư  ',
    );

    expect(recordEntityChange).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        aggregateType: 'BomRevision',
        aggregateId: 'rev-1',
        parentId: 'rev-1',
        eventType: AuditEventType.REJECTED,
        reason: 'Chờ R&D → Chờ NVKH: thiếu vật tư',
        changes: [
          { fieldName: 'status', oldValue: 'wait_rd', newValue: 'wait_nvkh' },
        ],
      }),
    );
  });

  it('labels a brand-new revision as coming from "Khởi tạo"', async () => {
    await service.recordWorkflow(
      manager,
      actor,
      revision,
      'create',
      null,
      'wait_nvkh',
    );
    expect(recordEntityChange.mock.calls[0][1].reason).toBe(
      'Khởi tạo → Chờ NVKH',
    );
  });

  it('writes nothing without an actor or without changes', async () => {
    await service.recordWorkflow(
      manager,
      undefined,
      revision,
      'forward',
      'wait_nvkh',
      'wait_rd',
    );
    await service.recordLinesSaved(
      manager,
      actor,
      revision,
      { changes: [], reason: '', created: 0, updated: 0, deleted: 0 },
      false,
    );
    await service.recordCostsSaved(manager, actor, revision, [], false);
    expect(recordEntityChange).not.toHaveBeenCalled();
  });

  it('counts two price changes with the same material name as two lines', async () => {
    await service.recordCostsSaved(
      manager,
      actor,
      revision,
      [
        { fieldName: 'Vải [A]::unitCost', oldValue: null, newValue: 1 },
        { fieldName: 'Vải [B]::unitCost', oldValue: null, newValue: 2 },
      ],
      false,
    );
    expect(recordEntityChange.mock.calls[0][1].reason).toBe(
      'Cập nhật đơn giá 2 dòng',
    );
  });

  it('flags a save that overwrote a newer version and picks the event type from the operations', async () => {
    await service.recordLinesSaved(
      manager,
      actor,
      revision,
      {
        changes: [
          { fieldName: 'A::materialName', oldValue: 'A', newValue: null },
        ],
        reason: 'Xoá 1 dòng',
        created: 0,
        updated: 0,
        deleted: 1,
      },
      true,
    );
    const input = recordEntityChange.mock.calls[0][1];
    expect(input.eventType).toBe(AuditEventType.DELETED);
    expect(input.reason).toBe(
      'Xoá 1 dòng (lưu đè lên bản mới hơn của người khác)',
    );
  });
});
