import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { StyleOperationStep } from './entities/StyleOperationStep.entity';
import { Style } from './entities/Style.entity';
import {
  CreateStyleOperationStepDto,
  UpdateStyleOperationStepDto,
  StyleOperationStepItemDto,
} from './dto/style-operation-step.dto';
import { AuditService } from '../audit/audit.service';
import { diffEntity, EntityFieldChange } from '../audit/entity-diff.util';
import { AuditActor } from '../audit/audit-actor.type';
import { AuditEventType } from '../../common/enums/database.enums';

export type { AuditActor };

const AGGREGATE_TYPE = 'StyleOperationStep';

const TRACKED_FIELDS = [
  'stepName',
  'description',
  'stageId',
  'timePerPiece',
  'ssv',
  'targetTotal',
  'note',
  'orderIndex',
  'isGroup',
  'groupId',
  'groupItems',
  'parentStepId',
] as const satisfies readonly (keyof StyleOperationStep)[];

@Injectable()
export class StyleOperationStepsService {
  constructor(
    @InjectRepository(StyleOperationStep)
    private readonly stepRepo: Repository<StyleOperationStep>,
    @InjectRepository(Style)
    private readonly styleRepo: Repository<Style>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  private async recordStepChange(
    manager: EntityManager,
    styleId: string,
    step: StyleOperationStep,
    eventType: AuditEventType,
    before: Partial<StyleOperationStep> | null,
    actor: AuditActor,
  ): Promise<void> {
    const changes = diffEntity(before, step, TRACKED_FIELDS);
    await this.auditService.recordEntityChange(manager, {
      aggregateType: AGGREGATE_TYPE,
      aggregateId: step.id,
      parentId: styleId,
      actorId: actor.id,
      actorRole: actor.roleCode,
      targetLabel: step.stepName,
      eventType,
      changes,
    });
  }

  async findByStyleId(styleId: string): Promise<StyleOperationStep[]> {
    await this.ensureStyleExists(styleId);
    return this.stepRepo.find({
      where: { styleId },
      order: { orderIndex: 'ASC' },
    });
  }

  async create(
    styleId: string,
    dto: CreateStyleOperationStepDto,
    actor: AuditActor,
  ): Promise<StyleOperationStep> {
    await this.ensureStyleExists(styleId);
    if (dto.stageId) {
      await this.ensureStageExists(dto.stageId);
    }
    const step = this.stepRepo.create({
      styleId,
      parentStepId: dto.parentStepId ?? null,
      stageId: dto.stageId ?? null,
      stepName: dto.stepName,
      description: dto.description ?? null,
      timePerPiece: dto.timePerPiece ?? 0,
      ssv: dto.ssv ?? 0,
      targetTotal: dto.targetTotal ?? 0,
      note: dto.note ?? null,
      orderIndex: dto.orderIndex ?? 0,
      isGroup: dto.isGroup ?? false,
      groupId: dto.groupId ?? null,
      groupItems: dto.groupItems ?? null,
    });
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.getRepository(StyleOperationStep).save(step);
      await this.recordStepChange(
        manager,
        styleId,
        saved,
        AuditEventType.CREATED,
        null,
        actor,
      );
      return saved;
    });
  }

  async createMany(
    styleId: string,
    steps: StyleOperationStepItemDto[],
    as3bCmBaseDays?: number,
    actor?: AuditActor,
  ): Promise<StyleOperationStep[]> {
    await this.ensureStyleExists(styleId);

    // Toàn bộ delete-rồi-tạo-lại phải nằm trong 1 transaction — nếu không,
    // một lỗi giữa chừng (VD trùng orderIndex) để lại DB ở trạng thái
    // "đã xoá bảng cũ, chỉ tạo được một phần bảng mới" — mất dữ liệu vĩnh viễn.
    try {
      return await this.dataSource.transaction(async (manager) => {
        const stepRepo = manager.getRepository(StyleOperationStep);
        const styleRepo = manager.getRepository(Style);

        // Snapshot trước khi xoá — dùng để so sánh field-level cho audit log,
        // vì createMany luôn xoá-rồi-tạo-lại chứ không UPDATE tại chỗ.
        const beforeSteps = await stepRepo.find({ where: { styleId } });
        const beforeById = new Map(beforeSteps.map((s) => [s.id, s]));

        // 1 lần bấm "Lưu" trên bảng công đoạn có thể đụng tới hàng chục dòng
        // (tạo/sửa/xoá trộn lẫn) — trước đây mỗi dòng ghi 1 audit event riêng,
        // khiến lịch sử vỡ vụn thành hàng chục dòng cho cùng 1 thao tác lưu.
        // Gom lại thành đúng 1 event/lần lưu: field-name của mỗi thay đổi
        // được gắn tiền tố "<tên công đoạn>::" để getFieldLabel() ghép thành
        // nhãn dễ đọc (VD "Cắt vải — Tên công đoạn") mà vẫn phân biệt được
        // dòng nào đổi gì khi mở rộng chi tiết.
        const createdLabels: string[] = [];
        const updatedLabels: string[] = [];
        const deletedLabels: string[] = [];
        const bulkChanges: EntityFieldChange[] = [];

        const accumulate = (
          after: StyleOperationStep,
          before: StyleOperationStep | null,
        ): void => {
          const rowLabel = after.stepName || '(không tên)';
          const fields = diffEntity(before, after, TRACKED_FIELDS);
          if (!before) {
            createdLabels.push(rowLabel);
          } else if (fields.length > 0) {
            updatedLabels.push(rowLabel);
          }
          for (const field of fields) {
            bulkChanges.push({
              ...field,
              fieldName: `${rowLabel}::${field.fieldName}`,
            });
          }
        };

        const accumulateDeleted = (before: StyleOperationStep): void => {
          deletedLabels.push(before.stepName || '(không tên)');
        };

        const finalizeBulkAudit = async (): Promise<void> => {
          if (!actor) return;
          if (
            createdLabels.length === 0 &&
            updatedLabels.length === 0 &&
            deletedLabels.length === 0
          ) {
            return;
          }
          const reasonParts: string[] = [];
          if (createdLabels.length > 0) {
            reasonParts.push(
              `Tạo mới ${createdLabels.length} công đoạn (${createdLabels.join(', ')})`,
            );
          }
          if (updatedLabels.length > 0) {
            reasonParts.push(
              `Cập nhật ${updatedLabels.length} công đoạn (${updatedLabels.join(', ')})`,
            );
          }
          if (deletedLabels.length > 0) {
            reasonParts.push(
              `Xoá ${deletedLabels.length} công đoạn (${deletedLabels.join(', ')})`,
            );
          }
          const isPureCreation =
            createdLabels.length > 0 &&
            updatedLabels.length === 0 &&
            deletedLabels.length === 0;
          const isPureDeletion =
            deletedLabels.length > 0 &&
            createdLabels.length === 0 &&
            updatedLabels.length === 0;
          const eventType = isPureCreation
            ? AuditEventType.CREATED
            : isPureDeletion
              ? AuditEventType.DELETED
              : AuditEventType.UPDATED;
          await this.auditService.recordEntityChange(manager, {
            aggregateType: AGGREGATE_TYPE,
            aggregateId: styleId,
            parentId: styleId,
            actorId: actor.id,
            actorRole: actor.roleCode,
            targetLabel: 'Quy trình công đoạn',
            eventType,
            reason: reasonParts.join('; '),
            changes: bulkChanges,
          });
        };

        if (as3bCmBaseDays && as3bCmBaseDays > 0) {
          await styleRepo.update(styleId, { as3bCmBaseDays });
        }

        // Unbind parent_step_id trước để tránh vướng Ràng buộc Khóa ngoại (Foreign Key) khi xoá
        await manager.query(
          'UPDATE style_operation_steps SET parent_step_id = NULL WHERE style_id = $1',
          [styleId],
        );
        await manager.query(
          'DELETE FROM style_operation_steps WHERE style_id = $1',
          [styleId],
        );

        if (!steps || steps.length === 0) {
          for (const before of beforeSteps) {
            accumulateDeleted(before);
          }
          await finalizeBulkAudit();
          return [];
        }

        const isUuid = (val?: string | null): boolean => {
          if (!val) return false;
          return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
            val,
          );
        };

        // Fetch existing valid stage and group IDs to guarantee Foreign Key integrity
        const validStageIds = new Set<string>();
        const validGroupIds = new Set<string>();

        const stageRows = await manager.query('SELECT id FROM stages');
        stageRows.forEach((r: { id: string }) => validStageIds.add(r.id));

        const groupRows = await manager.query('SELECT id FROM stage_groups');
        groupRows.forEach((r: { id: string }) => validGroupIds.add(r.id));

        // Trước đây stageId/groupId không hợp lệ bị âm thầm set về null — người
        // dùng lưu xong tưởng đã gán đúng công đoạn/nhóm nhưng thực ra mất
        // trắng không cảnh báo. Giờ chặn sớm, liệt kê rõ dòng nào bị lỗi.
        const invalidRefs: string[] = [];
        steps.forEach((step, index) => {
          const line = index + 1;
          if (step.stageId && !validStageIds.has(step.stageId)) {
            invalidRefs.push(
              `Dòng ${line} ("${step.stepName || ''}"): công đoạn (stage) không tồn tại`,
            );
          }
          if (step.groupId && !validGroupIds.has(step.groupId)) {
            invalidRefs.push(
              `Dòng ${line} ("${step.stepName || ''}"): nhóm công đoạn (group) không tồn tại`,
            );
          }
        });
        if (invalidRefs.length > 0) {
          throw new BadRequestException(
            `Dữ liệu công đoạn tham chiếu không hợp lệ:\n${invalidRefs.join('\n')}`,
          );
        }

        const tempIdToRealIdMap = new Map<string, string>();
        const savedStepsMap = new Map<number, StyleOperationStep>();

        const parentIndices: number[] = [];
        const childIndices: number[] = [];

        steps.forEach((step, index) => {
          const hasParent = Boolean(
            step.parentStepId && step.parentStepId.trim().length > 0,
          );
          if (step.isGroup || !hasParent) {
            parentIndices.push(index);
          } else {
            childIndices.push(index);
          }
        });

        const sanitizeGroupItems = (items: any) => {
          if (!items || !Array.isArray(items)) return null;
          try {
            return JSON.parse(JSON.stringify(items));
          } catch {
            return null;
          }
        };

        // Pass 1: Lưu các nhóm cha / công đoạn độc lập trước
        // Nếu step.id đã là UUID hợp lệ → giữ nguyên ID cũ để tránh mất state UI (expandedGroups)
        for (const index of parentIndices) {
          const step = steps[index];
          const rawId = step.id;
          const keepId = isUuid(rawId) ? rawId : undefined;

          const stageId =
            isUuid(step.stageId) && validStageIds.has(step.stageId!)
              ? step.stageId
              : null;
          const groupId =
            isUuid(step.groupId) && validGroupIds.has(step.groupId!)
              ? step.groupId
              : null;

          const entity = stepRepo.create({
            ...(keepId ? { id: keepId } : {}),
            styleId,
            parentStepId: null,
            stageId,
            stepName: String(step.stepName || '').substring(0, 255),
            description: step.description ? String(step.description) : null,
            timePerPiece: Math.max(0, Number(step.timePerPiece) || 0),
            ssv: Math.max(0, Number(step.ssv) || 0),
            targetTotal: Math.max(0, Math.round(Number(step.targetTotal) || 0)),
            note: step.note ? String(step.note) : null,
            orderIndex: Math.round(Number(step.orderIndex) ?? index),
            isGroup: Boolean(step.isGroup),
            groupId,
            groupItems: sanitizeGroupItems(step.groupItems),
          });

          const saved = await stepRepo.save(entity);
          savedStepsMap.set(index, saved);
          const before = beforeById.get(saved.id) ?? null;
          accumulate(saved, before);

          if (rawId) {
            tempIdToRealIdMap.set(rawId, saved.id);
            tempIdToRealIdMap.set(rawId.trim(), saved.id);
          }
          tempIdToRealIdMap.set(saved.id, saved.id);
        }

        // Pass 2: Lưu các công đoạn con, gán parentStepId theo real UUID từ Map
        // Giữ nguyên ID cũ nếu đã là UUID hợp lệ
        for (const index of childIndices) {
          const step = steps[index];
          const rawId = step.id;
          const keepId = isUuid(rawId) ? rawId : undefined;

          let parentStepId: string | null = null;
          if (step.parentStepId) {
            const rawParent = step.parentStepId.trim();
            const mapped =
              tempIdToRealIdMap.get(rawParent) ||
              tempIdToRealIdMap.get(step.parentStepId);
            parentStepId = mapped && isUuid(mapped) ? mapped : null;
          }

          const stageId =
            isUuid(step.stageId) && validStageIds.has(step.stageId!)
              ? step.stageId
              : null;
          const groupId =
            isUuid(step.groupId) && validGroupIds.has(step.groupId!)
              ? step.groupId
              : null;

          const entity = stepRepo.create({
            ...(keepId ? { id: keepId } : {}),
            styleId,
            parentStepId,
            stageId,
            stepName: String(step.stepName || '').substring(0, 255),
            description: step.description ? String(step.description) : null,
            timePerPiece: Math.max(0, Number(step.timePerPiece) || 0),
            ssv: Math.max(0, Number(step.ssv) || 0),
            targetTotal: Math.max(0, Math.round(Number(step.targetTotal) || 0)),
            note: step.note ? String(step.note) : null,
            orderIndex: Math.round(Number(step.orderIndex) ?? index),
            isGroup: Boolean(step.isGroup),
            groupId,
            groupItems: sanitizeGroupItems(step.groupItems),
          });

          const saved = await stepRepo.save(entity);
          savedStepsMap.set(index, saved);
          const before = beforeById.get(saved.id) ?? null;
          accumulate(saved, before);

          if (rawId) {
            tempIdToRealIdMap.set(rawId, saved.id);
            tempIdToRealIdMap.set(rawId.trim(), saved.id);
          }
          tempIdToRealIdMap.set(saved.id, saved.id);
        }

        const afterSteps = steps.map((_, index) => savedStepsMap.get(index)!);
        const afterIds = new Set(afterSteps.map((s) => s.id));
        for (const before of beforeSteps) {
          if (!afterIds.has(before.id)) {
            accumulateDeleted(before);
          }
        }

        await finalizeBulkAudit();

        return afterSteps;
      });
    } catch (err: any) {
      console.error(
        'Lỗi khi lưu quy trình công đoạn (createMany), đã rollback:',
        err?.message,
        err?.code,
      );
      if (err?.code === '23505') {
        throw new BadRequestException(
          'Dữ liệu công đoạn không hợp lệ (trùng thứ tự hoặc trùng công đoạn), vui lòng kiểm tra lại bảng trước khi lưu.',
        );
      }
      throw err;
    }
  }

  async update(
    styleId: string,
    stepId: string,
    dto: UpdateStyleOperationStepDto,
    actor: AuditActor,
  ): Promise<StyleOperationStep> {
    const step = await this.findOwnedStep(styleId, stepId);
    const before = { ...step };

    if (dto.stepName !== undefined) step.stepName = dto.stepName;
    if (dto.description !== undefined)
      step.description = dto.description ?? null;
    if (dto.timePerPiece !== undefined) step.timePerPiece = dto.timePerPiece;
    if (dto.ssv !== undefined) step.ssv = dto.ssv;
    if (dto.targetTotal !== undefined) step.targetTotal = dto.targetTotal;
    if (dto.note !== undefined) step.note = dto.note ?? null;
    if (dto.orderIndex !== undefined) step.orderIndex = dto.orderIndex;
    if (dto.isGroup !== undefined) step.isGroup = dto.isGroup;
    if (dto.groupId !== undefined) step.groupId = dto.groupId ?? null;
    if (dto.groupItems !== undefined) step.groupItems = dto.groupItems ?? null;
    if (dto.parentStepId !== undefined) {
      if (dto.parentStepId) {
        const parent = await this.stepRepo.findOne({
          where: { id: dto.parentStepId },
        });
        if (!parent) {
          throw new BadRequestException(
            `Công đoạn cha #${dto.parentStepId} không tồn tại`,
          );
        }
      }
      step.parentStepId = dto.parentStepId ?? null;
    }
    if (dto.stageId !== undefined) {
      if (dto.stageId) {
        await this.ensureStageExists(dto.stageId);
      }
      step.stageId = dto.stageId ?? null;
    }

    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.getRepository(StyleOperationStep).save(step);
      await this.recordStepChange(
        manager,
        styleId,
        saved,
        AuditEventType.UPDATED,
        before,
        actor,
      );
      return saved;
    });
  }

  async remove(
    styleId: string,
    stepId: string,
    actor: AuditActor,
  ): Promise<void> {
    const step = await this.findOwnedStep(styleId, stepId);

    const recordDeleted = async (
      manager: EntityManager,
      deleted: StyleOperationStep,
    ): Promise<void> => {
      await this.auditService.recordEntityChange(manager, {
        aggregateType: AGGREGATE_TYPE,
        aggregateId: deleted.id,
        parentId: styleId,
        actorId: actor.id,
        actorRole: actor.roleCode,
        targetLabel: deleted.stepName,
        eventType: AuditEventType.DELETED,
        changes: [],
      });
    };

    await this.dataSource.transaction(async (manager) => {
      const stepRepo = manager.getRepository(StyleOperationStep);

      // Nếu là nhóm công đoạn, xoá tất cả công đoạn con
      if (step.isGroup) {
        const children = await stepRepo.find({
          where: { parentStepId: step.id },
        });
        await stepRepo.delete({ parentStepId: step.id });
        for (const child of children) {
          await recordDeleted(manager, child);
        }
      }

      await stepRepo.remove(step);
      await recordDeleted(manager, step);
    });
  }

  private async findOwnedStep(
    styleId: string,
    stepId: string,
  ): Promise<StyleOperationStep> {
    const step = await this.stepRepo.findOne({ where: { id: stepId } });
    if (!step || step.styleId !== styleId) {
      throw new NotFoundException(`Công đoạn #${stepId} không tồn tại`);
    }
    return step;
  }

  private async ensureStageExists(stageId: string): Promise<void> {
    const rows = await this.stepRepo.query(
      'SELECT 1 FROM stages WHERE id = $1',
      [stageId],
    );
    if (rows.length === 0) {
      throw new BadRequestException(
        `Công đoạn (stage) #${stageId} không tồn tại`,
      );
    }
  }

  private async ensureStyleExists(styleId: string): Promise<void> {
    const style = await this.styleRepo.findOne({ where: { id: styleId } });
    if (!style) {
      throw new NotFoundException(`Mẫu Fit #${styleId} không tồn tại`);
    }
  }
}
