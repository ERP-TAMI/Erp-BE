import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { RecordStatus } from '../../../common/enums/database.enums';
import { Stage } from '../entities/Stage.entity';
import { CreateStageDto } from './dto/create-stage.dto';
import { QueryStagesDto } from './dto/query-stages.dto';
import { StageResponseDto } from './dto/stage-response.dto';
import { UpdateStageSsvBulkDto } from './dto/update-stage-ssv-bulk.dto';
import { UpdateStageStatusDto } from './dto/update-stage-status.dto';
import { UpdateStageDto } from './dto/update-stage.dto';

const GENERATED_CODE_SAVE_ATTEMPTS = 5;

@Injectable()
export class StagesService {
  constructor(
    @InjectRepository(Stage)
    private readonly stages: Repository<Stage>,
  ) {}

  async findAll(query: QueryStagesDto): Promise<StageResponseDto[]> {
    const baseWhere: FindOptionsWhere<Stage> = query.status
      ? { status: query.status }
      : {};
    const search = query.search?.trim();
    const where: FindOptionsWhere<Stage> | FindOptionsWhere<Stage>[] = search
      ? [
          { ...baseWhere, stageCode: ILike(`%${search}%`) },
          { ...baseWhere, stageName: ILike(`%${search}%`) },
        ]
      : baseWhere;
    const stages = await this.stages.find({
      where,
      order: { stageCode: 'ASC', id: 'ASC' },
    });
    return stages.map(StageResponseDto.fromEntity);
  }

  async findOne(id: string): Promise<StageResponseDto> {
    return StageResponseDto.fromEntity(await this.getExistingStage(id));
  }

  async create(dto: CreateStageDto): Promise<StageResponseDto> {
    const stageName = dto.stageName.trim();
    if (!dto.stageCode) {
      const stage = await this.saveStageWithGeneratedCode(stageName, dto);
      return StageResponseDto.fromEntity(stage);
    }

    const stageCode = this.normalizeCode(dto.stageCode);
    await this.ensureCodeUnique(stageCode);
    const stage = this.createStageEntity(stageCode, stageName, dto);
    return StageResponseDto.fromEntity(await this.saveStage(stage));
  }

  async update(id: string, dto: UpdateStageDto): Promise<StageResponseDto> {
    const stage = await this.getExistingStage(id);
    if (dto.stageCode !== undefined) {
      const stageCode = this.normalizeCode(dto.stageCode);
      if (stageCode !== this.normalizeCode(stage.stageCode)) {
        await this.ensureCodeUnique(stageCode, stage.id);
        stage.stageCode = stageCode;
      }
    }
    if (dto.stageName !== undefined) stage.stageName = dto.stageName.trim();
    if (dto.description !== undefined) {
      stage.description = this.normalizeDescription(dto.description);
    }
    if (dto.ssv !== undefined) stage.defaultSsv = dto.ssv;
    return StageResponseDto.fromEntity(await this.saveStage(stage));
  }

  async updateStatus(
    id: string,
    dto: UpdateStageStatusDto,
  ): Promise<StageResponseDto> {
    const stage = await this.getExistingStage(id);
    stage.status = dto.status;
    return StageResponseDto.fromEntity(await this.saveStage(stage));
  }

  async remove(id: string): Promise<void> {
    const stage = await this.getExistingStage(id);
    try {
      await this.stages.remove(stage);
    } catch (error) {
      if (this.hasDatabaseCode(error, '23503')) {
        throw new ConflictException(
          'Stage cannot be deleted because it is referenced by business data',
        );
      }
      throw error;
    }
  }

  async updateSsvBulk(dto: UpdateStageSsvBulkDto): Promise<StageResponseDto[]> {
    const ids = dto.items.map((item) => item.id);
    const stages = await this.stages.findBy({ id: In(ids) });
    if (stages.length !== ids.length) {
      throw new NotFoundException('One or more stages were not found');
    }

    const ssvById = new Map(dto.items.map((item) => [item.id, item.ssv]));
    for (const stage of stages) {
      stage.defaultSsv = ssvById.get(stage.id)!;
    }
    const saved = await this.stages.save(stages);
    const savedById = new Map(saved.map((stage) => [stage.id, stage]));
    return ids.map((id) => StageResponseDto.fromEntity(savedById.get(id)!));
  }

  private async getExistingStage(id: string): Promise<Stage> {
    const stage = await this.stages.findOneBy({ id });
    if (!stage) throw new NotFoundException('Stage not found');
    return stage;
  }

  private async ensureCodeUnique(
    stageCode: string,
    excludedStageId?: string,
  ): Promise<void> {
    const existing = await this.findByNormalizedCode(stageCode);
    if (existing && existing.id !== excludedStageId) {
      throw new ConflictException('Stage code already exists');
    }
  }

  private findByNormalizedCode(stageCode: string): Promise<Stage | null> {
    return this.stages
      .createQueryBuilder('stage')
      .where('UPPER(BTRIM(stage.stageCode)) = :stageCode', { stageCode })
      .getOne();
  }

  private async saveStage(stage: Stage): Promise<Stage> {
    try {
      return await this.stages.save(stage);
    } catch (error) {
      if (this.hasDatabaseCode(error, '23505')) {
        throw new ConflictException('Stage code already exists');
      }
      throw error;
    }
  }

  private async saveStageWithGeneratedCode(
    stageName: string,
    dto: CreateStageDto,
  ): Promise<Stage> {
    for (
      let attempt = 1;
      attempt <= GENERATED_CODE_SAVE_ATTEMPTS;
      attempt += 1
    ) {
      const stageCode = await this.generateUniqueCode(stageName);
      const stage = this.createStageEntity(stageCode, stageName, dto);
      try {
        return await this.stages.save(stage);
      } catch (error) {
        if (!this.hasDatabaseCode(error, '23505')) throw error;
      }
    }

    throw new ConflictException('Unable to generate a unique stage code');
  }

  private createStageEntity(
    stageCode: string,
    stageName: string,
    dto: CreateStageDto,
  ): Stage {
    return this.stages.create({
      stageCode,
      stageName,
      description: this.normalizeDescription(dto.description),
      defaultSsv: dto.ssv ?? '0',
      status: RecordStatus.ACTIVE,
    });
  }

  private normalizeCode(value: string): string {
    return value.trim().toUpperCase();
  }

  private async generateUniqueCode(stageName: string): Promise<string> {
    const baseCode = this.buildGeneratedCode(stageName);

    for (let sequence = 1; sequence <= 100; sequence += 1) {
      const suffix = sequence === 1 ? '' : `-${sequence}`;
      const prefix = baseCode.slice(0, 50 - suffix.length).replace(/-+$/, '');
      const candidate = `${prefix}${suffix}`;
      if (!(await this.findByNormalizedCode(candidate))) return candidate;
    }

    throw new ConflictException('Unable to generate a unique stage code');
  }

  private buildGeneratedCode(stageName: string): string {
    const slug = stageName
      .replace(/[Đđ]/g, 'D')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `GD-${slug || 'CONG-DOAN'}`.slice(0, 50).replace(/-+$/, '');
  }

  private normalizeDescription(value?: string | null): string | null {
    return value?.trim() || null;
  }

  private hasDatabaseCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === code
    );
  }
}
