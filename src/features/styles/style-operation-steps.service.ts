import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

    if (as3bCmBaseDays && as3bCmBaseDays > 0) {
      await this.styleRepo.update(styleId, { as3bCmBaseDays });
    }

    // Xoá toàn bộ công đoạn cũ của style
    await this.stepRepo.delete({ styleId });

    // Tạo mới công đoạn theo thứ tự
    const newSteps = (steps || []).map((step, index) =>
      this.stepRepo.create({
        id: step.id && !step.id.startsWith('copy-') && !step.id.startsWith('new-') ? step.id : undefined,
        styleId,
        parentStepId: step.parentStepId ?? null,
        stageId: step.stageId ?? null,
        stepName: step.stepName,
        description: step.description ?? null,
        timePerPiece: step.timePerPiece ?? 0,
        ssv: step.ssv ?? 0,
        targetTotal: step.targetTotal ?? 0,
        note: step.note ?? null,
        orderIndex: step.orderIndex ?? index,
        isGroup: step.isGroup ?? false,
        groupId: step.groupId ?? null,
        groupItems: step.groupItems ?? null,
      }),
    );

    if (newSteps.length === 0) return [];
    return this.stepRepo.save(newSteps);
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
    if (dto.description !== undefined) step.description = dto.description ?? null;
    if (dto.timePerPiece !== undefined) step.timePerPiece = dto.timePerPiece;
    if (dto.ssv !== undefined) step.ssv = dto.ssv;
    if (dto.targetTotal !== undefined) step.targetTotal = dto.targetTotal;
    if (dto.note !== undefined) step.note = dto.note ?? null;
    if (dto.orderIndex !== undefined) step.orderIndex = dto.orderIndex;
    if (dto.isGroup !== undefined) step.isGroup = dto.isGroup;
    if (dto.groupId !== undefined) step.groupId = dto.groupId ?? null;
    if (dto.groupItems !== undefined) step.groupItems = dto.groupItems ?? null;
    if (dto.parentStepId !== undefined) step.parentStepId = dto.parentStepId ?? null;
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
