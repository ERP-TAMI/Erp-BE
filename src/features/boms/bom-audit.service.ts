import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditActor } from '../audit/audit-actor.type';
import { EntityFieldChange } from '../audit/entity-diff.util';
import { AuditEventType } from '../../common/enums/database.enums';
import { getFieldValueLabel } from '../audit/entity-audit.config';
import { LineAuditResult } from './bom-lines-plan';

const BOM_AGGREGATE = 'Bom';
const REVISION_AGGREGATE = 'BomRevision';
const LINES_LABEL = 'Định mức nguyên phụ liệu';

type RevisionRef = { id: string; revisionNo: number };

const WORKFLOW_EVENT_TYPE: Record<string, AuditEventType> = {
  create: AuditEventType.CREATED,
  forward: AuditEventType.STATUS_CHANGED,
  reject: AuditEventType.REJECTED,
  approve: AuditEventType.APPROVED,
};

@Injectable()
export class BomAuditService {
  constructor(private readonly auditService: AuditService) {}

  async recordHeaderChange(
    manager: EntityManager,
    actor: AuditActor | undefined,
    bom: { id: string; bomCode: string },
    changes: EntityFieldChange[],
    eventType: AuditEventType = AuditEventType.UPDATED,
    reason?: string,
  ): Promise<void> {
    if (!actor) return;
    await this.auditService.recordEntityChange(manager, {
      aggregateType: BOM_AGGREGATE,
      aggregateId: bom.id,
      parentId: bom.id,
      actorId: actor.id,
      actorRole: actor.roleCode,
      targetLabel: bom.bomCode,
      eventType,
      reason,
      changes,
    });
  }

  async recordRevisionCreated(
    manager: EntityManager,
    actor: AuditActor | undefined,
    bom: { id: string; bomCode: string },
    revision: RevisionRef,
    sourceRevisionNo: number | null,
    changeReason: string,
  ): Promise<void> {
    await this.recordHeaderChange(
      manager,
      actor,
      bom,
      [
        {
          fieldName: 'revisionNo',
          oldValue: null,
          newValue: revision.revisionNo,
        },
        {
          fieldName: 'sourceRevisionNo',
          oldValue: null,
          newValue: sourceRevisionNo,
        },
        { fieldName: 'changeReason', oldValue: null, newValue: changeReason },
      ],
      AuditEventType.CREATED,
      `Tạo phiên bản ${revision.revisionNo}`,
    );
  }

  async recordPromote(
    manager: EntityManager,
    actor: AuditActor | undefined,
    bom: { id: string; bomCode: string },
    fromRevisionNo: number,
    toRevisionNo: number,
    reason: string,
  ): Promise<void> {
    await this.recordHeaderChange(
      manager,
      actor,
      bom,
      [
        {
          fieldName: 'currentRevisionNo',
          oldValue: fromRevisionNo,
          newValue: toRevisionNo,
        },
      ],
      AuditEventType.UPDATED,
      `Đổi phiên bản hiện hành về phiên bản ${toRevisionNo}: ${reason}`,
    );
  }

  /** Ghi song song với bom_revision_status_history. */
  async recordWorkflow(
    manager: EntityManager,
    actor: AuditActor | undefined,
    revision: RevisionRef,
    action: 'create' | 'forward' | 'reject' | 'approve',
    oldStatus: string | null,
    newStatus: string,
    reason?: string | null,
  ): Promise<void> {
    if (!actor) return;
    await this.auditService.recordEntityChange(manager, {
      aggregateType: REVISION_AGGREGATE,
      aggregateId: revision.id,
      parentId: revision.id,
      actorId: actor.id,
      actorRole: actor.roleCode,
      targetLabel: `Phiên bản ${revision.revisionNo}`,
      eventType: WORKFLOW_EVENT_TYPE[action],
      reason: this.workflowReason(oldStatus, newStatus, reason),
      changes: [
        { fieldName: 'status', oldValue: oldStatus, newValue: newStatus },
      ],
    });
  }

  async recordLinesSaved(
    manager: EntityManager,
    actor: AuditActor | undefined,
    revision: RevisionRef,
    result: LineAuditResult,
    overwroteNewerVersion: boolean,
  ): Promise<void> {
    if (!actor || result.changes.length === 0) return;
    const reason = overwroteNewerVersion
      ? `${result.reason} (lưu đè lên bản mới hơn của người khác)`
      : result.reason;
    await this.auditService.recordEntityChange(manager, {
      aggregateType: REVISION_AGGREGATE,
      aggregateId: revision.id,
      parentId: revision.id,
      actorId: actor.id,
      actorRole: actor.roleCode,
      targetLabel: LINES_LABEL,
      eventType: this.linesEventType(result),
      reason,
      changes: result.changes,
    });
  }

  async recordLinesCopied(
    manager: EntityManager,
    actor: AuditActor | undefined,
    revision: RevisionRef,
    lineCount: number,
    sourceRevisionNo: number,
  ): Promise<void> {
    if (!actor) return;
    await this.auditService.recordEntityChange(manager, {
      aggregateType: REVISION_AGGREGATE,
      aggregateId: revision.id,
      parentId: revision.id,
      actorId: actor.id,
      actorRole: actor.roleCode,
      targetLabel: LINES_LABEL,
      eventType: AuditEventType.COPIED,
      reason: `Sao chép ${lineCount} dòng từ Fit NPL (phiên bản ${sourceRevisionNo})`,
      changes: [],
    });
  }

  async recordCostsSaved(
    manager: EntityManager,
    actor: AuditActor | undefined,
    revision: RevisionRef,
    changes: EntityFieldChange[],
    overwroteNewerVersion: boolean,
  ): Promise<void> {
    if (!actor || changes.length === 0) return;
    const rows = changes.length;
    const reason = `Cập nhật đơn giá ${rows} dòng${
      overwroteNewerVersion ? ' (lưu đè lên bản mới hơn của người khác)' : ''
    }`;
    await this.auditService.recordEntityChange(manager, {
      aggregateType: REVISION_AGGREGATE,
      aggregateId: revision.id,
      parentId: revision.id,
      actorId: actor.id,
      actorRole: actor.roleCode,
      targetLabel: 'Đơn giá vật tư',
      eventType: AuditEventType.UPDATED,
      reason,
      changes,
    });
  }

  /** Dùng cho các endpoint dòng lẻ cũ (deprecated). */
  async recordSingleLineChange(
    manager: EntityManager,
    actor: AuditActor | undefined,
    revision: RevisionRef,
    rowLabel: string,
    eventType: AuditEventType,
    changes: EntityFieldChange[],
    reason: string,
  ): Promise<void> {
    await this.recordLineEvent(
      manager,
      actor,
      revision,
      eventType,
      changes.map((change) => ({
        ...change,
        fieldName: `${rowLabel}::${change.fieldName}`,
      })),
      reason,
    );
  }

  /** `changes` đã có tiền tố "<tên dòng>::". */
  async recordLineEvent(
    manager: EntityManager,
    actor: AuditActor | undefined,
    revision: RevisionRef,
    eventType: AuditEventType,
    changes: EntityFieldChange[],
    reason: string,
  ): Promise<void> {
    if (!actor || changes.length === 0) return;
    await this.auditService.recordEntityChange(manager, {
      aggregateType: REVISION_AGGREGATE,
      aggregateId: revision.id,
      parentId: revision.id,
      actorId: actor.id,
      actorRole: actor.roleCode,
      targetLabel: LINES_LABEL,
      eventType,
      reason,
      changes,
    });
  }

  private workflowReason(
    oldStatus: string | null,
    newStatus: string,
    note?: string | null,
  ): string {
    const label = (status: string) =>
      getFieldValueLabel(REVISION_AGGREGATE, 'status', status) ?? status;
    const move = `${oldStatus ? label(oldStatus) : 'Khởi tạo'} → ${label(newStatus)}`;
    const text = note?.trim();
    return text ? `${move}: ${text}` : move;
  }

  private linesEventType(result: LineAuditResult): AuditEventType {
    if (result.created > 0 && result.updated === 0 && result.deleted === 0) {
      return AuditEventType.CREATED;
    }
    if (result.deleted > 0 && result.created === 0 && result.updated === 0) {
      return AuditEventType.DELETED;
    }
    return AuditEventType.UPDATED;
  }
}
