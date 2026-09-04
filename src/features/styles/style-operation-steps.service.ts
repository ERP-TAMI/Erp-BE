import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StyleOperationStep } from './entities/StyleOperationStep.entity';
import { Style } from './entities/Style.entity';
import {
  CreateStyleOperationStepDto,
  UpdateStyleOperationStepDto,
  StyleOperationStepItemDto,
} from './dto/style-operation-step.dto';

@Injectable()
export class StyleOperationStepsService {
  constructor(
    @InjectRepository(StyleOperationStep)
    private readonly stepRepo: Repository<StyleOperationStep>,
    @InjectRepository(Style)
    private readonly styleRepo: Repository<Style>,
  ) {}

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
  ): Promise<StyleOperationStep> {
    await this.ensureStyleExists(styleId);
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
    return this.stepRepo.save(step);
  }

  async createMany(
    styleId: string,
    steps: StyleOperationStepItemDto[],
    as3bCmBaseDays?: number,
  ): Promise<StyleOperationStep[]> {
    await this.ensureStyleExists(styleId);

    try {
      if (as3bCmBaseDays && as3bCmBaseDays > 0) {
        await this.styleRepo.update(styleId, { as3bCmBaseDays });
      }

      // Unbind parent_step_id trước để tránh vướng Ràng buộc Khóa ngoại (Foreign Key) khi xoá
      await this.stepRepo.query(
        'UPDATE style_operation_steps SET parent_step_id = NULL WHERE style_id = $1',
        [styleId],
      );
      await this.stepRepo.query(
        'DELETE FROM style_operation_steps WHERE style_id = $1',
        [styleId],
      );

      if (!steps || steps.length === 0) return [];

      const isUuid = (val?: string | null): boolean => {
        if (!val) return false;
        return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
          val,
        );
      };

      // Fetch existing valid stage and group IDs to guarantee Foreign Key integrity
      const validStageIds = new Set<string>();
      const validGroupIds = new Set<string>();

      try {
        const stageRows = await this.stepRepo.query('SELECT id FROM stages');
        stageRows.forEach((r: { id: string }) => validStageIds.add(r.id));
      } catch (err) {
        console.warn('Could not query stages table:', err);
      }

      try {
        const groupRows = await this.stepRepo.query(
          'SELECT id FROM stage_groups',
        );
        groupRows.forEach((r: { id: string }) => validGroupIds.add(r.id));
      } catch (err) {
        console.warn('Could not query stage_groups table:', err);
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

        const entity = this.stepRepo.create({
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

        const saved = await this.stepRepo.save(entity);
        savedStepsMap.set(index, saved);

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

        const entity = this.stepRepo.create({
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

        const saved = await this.stepRepo.save(entity);
        savedStepsMap.set(index, saved);

        if (rawId) {
          tempIdToRealIdMap.set(rawId, saved.id);
          tempIdToRealIdMap.set(rawId.trim(), saved.id);
        }
        tempIdToRealIdMap.set(saved.id, saved.id);
      }

      return steps.map((_, index) => savedStepsMap.get(index)!);
    } catch (err: any) {
      console.error(
        'Lỗi khi lưu quy trình công đoạn (createMany):',
        err?.message,
        err?.code,
      );
      throw err;
    }
  }

  async update(
    stepId: string,
    dto: UpdateStyleOperationStepDto,
  ): Promise<StyleOperationStep> {
    const step = await this.stepRepo.findOne({ where: { id: stepId } });
    if (!step) {
      throw new NotFoundException(`Công đoạn #${stepId} không tồn tại`);
    }

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
    if (dto.parentStepId !== undefined)
      step.parentStepId = dto.parentStepId ?? null;
    if (dto.stageId !== undefined) step.stageId = dto.stageId ?? null;

    return this.stepRepo.save(step);
  }

  async remove(stepId: string): Promise<void> {
    const step = await this.stepRepo.findOne({ where: { id: stepId } });
    if (!step) {
      throw new NotFoundException(`Công đoạn #${stepId} không tồn tại`);
    }

    // Nếu là nhóm công đoạn, xoá tất cả công đoạn con
    if (step.isGroup) {
      await this.stepRepo.delete({ parentStepId: step.id });
    }

    await this.stepRepo.remove(step);
  }

  async reorder(
    styleId: string,
    orderedIds: string[],
  ): Promise<StyleOperationStep[]> {
    await this.ensureStyleExists(styleId);

    const updates = (orderedIds || []).map((id, index) =>
      this.stepRepo.update(id, { orderIndex: index }),
    );
    await Promise.all(updates);

    return this.findByStyleId(styleId);
  }

  private async ensureStyleExists(styleId: string): Promise<void> {
    const style = await this.styleRepo.findOne({ where: { id: styleId } });
    if (!style) {
      throw new NotFoundException(`Mẫu Fit #${styleId} không tồn tại`);
    }
  }
}
