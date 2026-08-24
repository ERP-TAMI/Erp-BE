import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  ILike,
  In,
  Repository,
} from 'typeorm';
import { RecordStatus } from '../../../common/enums/database.enums';
import { Stage } from '../entities/Stage.entity';
import { StageGroup } from '../entities/StageGroup.entity';
import { StageGroupItem } from '../entities/StageGroupItem.entity';
import { CreateStageGroupDto } from './dto/create-stage-group.dto';
import { QueryStageGroupsDto } from './dto/query-stage-groups.dto';
import {
  StageGroupResponseDto,
  StageGroupSummaryResponseDto,
} from './dto/stage-group-response.dto';
import { StageGroupItemInputDto } from './dto/stage-group-item-input.dto';
import { UpdateStageGroupStatusDto } from './dto/update-stage-group-status.dto';
import { UpdateStageGroupDto } from './dto/update-stage-group.dto';

const GENERATED_CODE_SAVE_ATTEMPTS = 5;

@Injectable()
export class StageGroupsService {
  constructor(
    @InjectRepository(StageGroup)
    private readonly groups: Repository<StageGroup>,
    @InjectRepository(StageGroupItem)
    private readonly items: Repository<StageGroupItem>,
    @InjectRepository(Stage)
    private readonly stages: Repository<Stage>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(
    query: QueryStageGroupsDto,
  ): Promise<StageGroupSummaryResponseDto[]> {
    const baseWhere: FindOptionsWhere<StageGroup> = query.status
      ? { status: query.status }
      : {};
    const search = query.search?.trim();
    const where: FindOptionsWhere<StageGroup> | FindOptionsWhere<StageGroup>[] =
      search
        ? [
            { ...baseWhere, groupCode: ILike(`%${search}%`) },
            { ...baseWhere, groupName: ILike(`%${search}%`) },
          ]
        : baseWhere;
    const groups = await this.groups.find({
      where,
      order: { groupCode: 'ASC', id: 'ASC' },
    });
    if (groups.length === 0) return [];

    const groupIds = groups.map((group) => group.id);
    const items = await this.items.find({
      select: { stageGroupId: true },
      where: { stageGroupId: In(groupIds) },
    });
    const itemCountByGroupId = new Map<string, number>();
    for (const item of items) {
      itemCountByGroupId.set(
        item.stageGroupId,
        (itemCountByGroupId.get(item.stageGroupId) ?? 0) + 1,
      );
    }

    return groups.map((group) =>
      StageGroupSummaryResponseDto.fromEntity(
        group,
        itemCountByGroupId.get(group.id) ?? 0,
      ),
    );
  }

  async findOne(id: string): Promise<StageGroupResponseDto> {
    const group = await this.getExistingGroup(this.groups, id);
    return this.loadResponse(this.items, this.stages, group);
  }

  async create(dto: CreateStageGroupDto): Promise<StageGroupResponseDto> {
    if (dto.groupCode) {
      try {
        return await this.createInTransaction(
          dto,
          this.normalizeCode(dto.groupCode),
        );
      } catch (error) {
        if (this.hasDatabaseCode(error, '23505')) {
          throw new ConflictException('Stage group code already exists');
        }
        throw error;
      }
    }

    for (
      let attempt = 1;
      attempt <= GENERATED_CODE_SAVE_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.dataSource.transaction(async (manager) => {
          const repositories = this.getRepositories(manager);
          const groupCode = await this.generateUniqueCode(
            repositories.groups,
            dto.groupName,
          );
          return this.createWithRepositories(dto, groupCode, repositories);
        });
      } catch (error) {
        if (!this.hasDatabaseCode(error, '23505')) throw error;
      }
    }

    throw new ConflictException('Unable to generate a unique stage group code');
  }

  async update(
    id: string,
    dto: UpdateStageGroupDto,
  ): Promise<StageGroupResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const repositories = this.getRepositories(manager);
      const group = await this.getExistingGroup(repositories.groups, id);
      if (dto.groupName !== undefined) group.groupName = dto.groupName.trim();
      if (dto.description !== undefined) {
        group.description = this.normalizeDescription(dto.description);
      }
      const savedGroup = await repositories.groups.save(group);

      if (dto.items === undefined) {
        return this.loadResponse(
          repositories.items,
          repositories.stages,
          savedGroup,
        );
      }

      this.ensureOrderIndices(dto.items);
      const stagesById = await this.loadStages(repositories.stages, dto.items);
      await repositories.items.delete({ stageGroupId: id });
      const replacementItems = this.createSnapshotItems(
        repositories.items,
        id,
        dto.items,
        stagesById,
      );
      const savedItems = await repositories.items.save(replacementItems);
      return StageGroupResponseDto.fromEntities(
        savedGroup,
        savedItems,
        stagesById,
      );
    });
  }

  async updateStatus(
    id: string,
    dto: UpdateStageGroupStatusDto,
  ): Promise<StageGroupResponseDto> {
    const group = await this.getExistingGroup(this.groups, id);
    group.status = dto.status;
    const savedGroup = await this.groups.save(group);
    return this.loadResponse(this.items, this.stages, savedGroup);
  }

  private getRepositories(manager: EntityManager): {
    groups: Repository<StageGroup>;
    items: Repository<StageGroupItem>;
    stages: Repository<Stage>;
  } {
    return {
      groups: manager.getRepository(StageGroup),
      items: manager.getRepository(StageGroupItem),
      stages: manager.getRepository(Stage),
    };
  }

  private createInTransaction(
    dto: CreateStageGroupDto,
    groupCode: string,
  ): Promise<StageGroupResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const repositories = this.getRepositories(manager);
      await this.ensureCodeUnique(repositories.groups, groupCode);
      return this.createWithRepositories(dto, groupCode, repositories);
    });
  }

  private async createWithRepositories(
    dto: CreateStageGroupDto,
    groupCode: string,
    repositories: ReturnType<StageGroupsService['getRepositories']>,
  ): Promise<StageGroupResponseDto> {
    this.ensureOrderIndices(dto.items);
    const stagesById = await this.loadStages(repositories.stages, dto.items);
    const group = repositories.groups.create({
      groupCode,
      groupName: dto.groupName.trim(),
      description: this.normalizeDescription(dto.description),
      status: RecordStatus.ACTIVE,
    });
    const savedGroup = await repositories.groups.save(group);
    const items = this.createSnapshotItems(
      repositories.items,
      savedGroup.id,
      dto.items,
      stagesById,
    );
    const savedItems = await repositories.items.save(items);
    return StageGroupResponseDto.fromEntities(
      savedGroup,
      savedItems,
      stagesById,
    );
  }

  private async loadResponse(
    itemsRepository: Repository<StageGroupItem>,
    stagesRepository: Repository<Stage>,
    group: StageGroup,
  ): Promise<StageGroupResponseDto> {
    const items = await itemsRepository.find({
      where: { stageGroupId: group.id },
      order: { orderIndex: 'ASC', stageId: 'ASC' },
    });
    const stagesById = await this.loadStagesByIds(
      stagesRepository,
      items.map((item) => item.stageId),
    );
    return StageGroupResponseDto.fromEntities(group, items, stagesById);
  }

  private async getExistingGroup(
    repository: Repository<StageGroup>,
    id: string,
  ): Promise<StageGroup> {
    const group = await repository.findOneBy({ id });
    if (!group) throw new NotFoundException('Stage group not found');
    return group;
  }

  private async ensureCodeUnique(
    repository: Repository<StageGroup>,
    groupCode: string,
  ): Promise<void> {
    const duplicate = await repository
      .createQueryBuilder('stageGroup')
      .where('UPPER(BTRIM(stageGroup.groupCode)) = :groupCode', { groupCode })
      .getOne();
    if (duplicate)
      throw new ConflictException('Stage group code already exists');
  }

  private async findByNormalizedCode(
    repository: Repository<StageGroup>,
    groupCode: string,
  ): Promise<StageGroup | null> {
    return repository
      .createQueryBuilder('stageGroup')
      .where('UPPER(BTRIM(stageGroup.groupCode)) = :groupCode', { groupCode })
      .getOne();
  }

  private async generateUniqueCode(
    repository: Repository<StageGroup>,
    groupName: string,
  ): Promise<string> {
    const baseCode = this.buildGeneratedCode(groupName);
    for (let sequence = 1; sequence <= 100; sequence += 1) {
      const suffix = sequence === 1 ? '' : `-${sequence}`;
      const prefix = baseCode.slice(0, 50 - suffix.length).replace(/-+$/, '');
      const candidate = `${prefix}${suffix}`;
      if (!(await this.findByNormalizedCode(repository, candidate))) {
        return candidate;
      }
    }
    throw new ConflictException('Unable to generate a unique stage group code');
  }

  private buildGeneratedCode(groupName: string): string {
    const slug = groupName
      .replace(/[Đđ]/g, 'D')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const prefixed = slug
      ? slug.startsWith('NS-')
        ? slug
        : `NS-${slug}`
      : 'NS-NHOM-CONG-DOAN';
    return prefixed.slice(0, 50).replace(/-+$/, '');
  }

  private async loadStages(
    repository: Repository<Stage>,
    items: StageGroupItemInputDto[],
  ): Promise<Map<string, Stage>> {
    const ids = items.map((item) => item.stageId);
    const stagesById = await this.loadStagesByIds(repository, ids);
    if (stagesById.size !== ids.length) {
      throw new BadRequestException('One or more stages were not found');
    }
    return stagesById;
  }

  private async loadStagesByIds(
    repository: Repository<Stage>,
    ids: string[],
  ): Promise<Map<string, Stage>> {
    if (ids.length === 0) return new Map();
    const stages = await repository.findBy({ id: In(ids) });
    return new Map(stages.map((stage) => [stage.id, stage]));
  }

  private createSnapshotItems(
    repository: Repository<StageGroupItem>,
    stageGroupId: string,
    inputItems: StageGroupItemInputDto[],
    stagesById: Map<string, Stage>,
  ): StageGroupItem[] {
    return inputItems.map((item) => {
      const stage = stagesById.get(item.stageId)!;
      return repository.create({
        stageGroupId,
        stageId: item.stageId,
        orderIndex: item.orderIndex,
        nameSnapshot: stage.stageName,
        descriptionSnapshot: stage.description,
        ssvSnapshot: stage.defaultSsv,
      });
    });
  }

  private ensureOrderIndices(items: StageGroupItemInputDto[]): void {
    const orderIndices = items
      .map((item) => item.orderIndex)
      .sort((left, right) => left - right);
    const isContiguous = orderIndices.every((value, index) => value === index);
    if (!isContiguous) {
      throw new BadRequestException(
        'Stage group item order indices must be contiguous from zero',
      );
    }
  }

  private normalizeCode(value: string): string {
    return value.trim().toUpperCase();
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
