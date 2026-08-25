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
import { StageGroup } from '../entities/StageGroup.entity';
import { StageGroupItem } from '../entities/StageGroupItem.entity';
import { CreateStageGroupDto } from './dto/create-stage-group.dto';
import { QueryStageGroupsDto } from './dto/query-stage-groups.dto';
import {
  StageGroupResponseDto,
  StageGroupSummaryResponseDto,
} from './dto/stage-group-response.dto';
import {
  CreateStageGroupItemDto,
  UpdateStageGroupItemDto,
} from './dto/stage-group-item-input.dto';
import { UpdateStageGroupStatusDto } from './dto/update-stage-group-status.dto';
import { UpdateStageGroupDto } from './dto/update-stage-group.dto';

const GENERATED_CODE_SAVE_ATTEMPTS = 5;

type StageGroupRepositories = {
  groups: Repository<StageGroup>;
  items: Repository<StageGroupItem>;
};

@Injectable()
export class StageGroupsService {
  constructor(
    @InjectRepository(StageGroup)
    private readonly groups: Repository<StageGroup>,
    @InjectRepository(StageGroupItem)
    private readonly items: Repository<StageGroupItem>,
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
    const itemCounts = await this.items
      .createQueryBuilder('item')
      .select('item.stageGroupId', 'stageGroupId')
      .addSelect('COUNT(item.id)', 'itemCount')
      .where('item.stageGroupId IN (:...groupIds)', { groupIds })
      .groupBy('item.stageGroupId')
      .getRawMany<{ stageGroupId: string; itemCount: string }>();
    const itemCountByGroupId = new Map(
      itemCounts.map(({ stageGroupId, itemCount }) => [
        stageGroupId,
        Number.parseInt(itemCount, 10),
      ]),
    );

    return groups.map((group) =>
      StageGroupSummaryResponseDto.fromEntity(
        group,
        itemCountByGroupId.get(group.id) ?? 0,
      ),
    );
  }

  async findOne(id: string): Promise<StageGroupResponseDto> {
    const group = await this.getExistingGroup(this.groups, id);
    return this.loadResponse(this.items, group);
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
        return this.loadResponse(repositories.items, savedGroup);
      }

      this.ensureOrderIndices(dto.items);
      this.ensureUniqueItemIds(dto.items);
      const savedItems = await this.reconcileItems(
        repositories.items,
        id,
        dto.items,
      );
      return StageGroupResponseDto.fromEntities(savedGroup, savedItems);
    });
  }

  async updateStatus(
    id: string,
    dto: UpdateStageGroupStatusDto,
  ): Promise<StageGroupResponseDto> {
    const group = await this.getExistingGroup(this.groups, id);
    group.status = dto.status;
    const savedGroup = await this.groups.save(group);
    return this.loadResponse(this.items, savedGroup);
  }

  async remove(id: string): Promise<void> {
    const group = await this.getExistingGroup(this.groups, id);
    try {
      await this.groups.remove(group);
    } catch (error) {
      if (this.hasDatabaseCode(error, '23503')) {
        throw new ConflictException(
          'Stage group cannot be deleted because it is referenced by business data',
        );
      }
      throw error;
    }
  }

  private getRepositories(manager: EntityManager): StageGroupRepositories {
    return {
      groups: manager.getRepository(StageGroup),
      items: manager.getRepository(StageGroupItem),
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
    repositories: StageGroupRepositories,
  ): Promise<StageGroupResponseDto> {
    this.ensureOrderIndices(dto.items);
    const group = repositories.groups.create({
      groupCode,
      groupName: dto.groupName.trim(),
      description: this.normalizeDescription(dto.description),
      status: RecordStatus.ACTIVE,
    });
    const savedGroup = await repositories.groups.save(group);
    const items = dto.items.map((item) =>
      this.createOwnedItem(repositories.items, savedGroup.id, item),
    );
    const savedItems = await repositories.items.save(items);
    return StageGroupResponseDto.fromEntities(savedGroup, savedItems);
  }

  private async reconcileItems(
    repository: Repository<StageGroupItem>,
    stageGroupId: string,
    inputItems: UpdateStageGroupItemDto[],
  ): Promise<StageGroupItem[]> {
    const existingItems = await repository.find({
      where: { stageGroupId },
      order: { orderIndex: 'ASC', id: 'ASC' },
    });
    const existingById = new Map(existingItems.map((item) => [item.id, item]));
    const requestedIds = inputItems.flatMap((item) =>
      item.id ? [item.id] : [],
    );
    const foreignId = requestedIds.find((id) => !existingById.has(id));
    if (foreignId) {
      throw new BadRequestException(
        'One or more stage group item IDs do not belong to this group',
      );
    }

    if (existingItems.length > 0) {
      const temporaryOffset = existingItems.length + inputItems.length + 1;
      await repository.save(
        existingItems.map((item) => ({
          ...item,
          orderIndex: item.orderIndex + temporaryOffset,
        })),
      );
    }

    const retainedIds = new Set(requestedIds);
    const removedIds = existingItems
      .filter((item) => !retainedIds.has(item.id))
      .map((item) => item.id);
    if (removedIds.length > 0) {
      try {
        await repository.delete({ id: In(removedIds) });
      } catch (error) {
        if (this.hasDatabaseCode(error, '23503')) {
          throw new ConflictException(
            'Stage group item cannot be removed because it is referenced by business data',
          );
        }
        throw error;
      }
    }

    const replacements = inputItems.map((input) =>
      repository.create({
        ...(input.id ? existingById.get(input.id) : undefined),
        ...(input.id ? { id: input.id } : {}),
        stageGroupId,
        itemName: input.itemName.trim(),
        description: this.normalizeDescription(input.description),
        ssv: input.ssv,
        status: input.status ?? RecordStatus.ACTIVE,
        orderIndex: input.orderIndex,
      }),
    );
    return repository.save(replacements);
  }

  private createOwnedItem(
    repository: Repository<StageGroupItem>,
    stageGroupId: string,
    input: CreateStageGroupItemDto,
  ): StageGroupItem {
    return repository.create({
      stageGroupId,
      itemName: input.itemName.trim(),
      description: this.normalizeDescription(input.description),
      ssv: input.ssv,
      status: input.status ?? RecordStatus.ACTIVE,
      orderIndex: input.orderIndex,
    });
  }

  private async loadResponse(
    itemsRepository: Repository<StageGroupItem>,
    group: StageGroup,
  ): Promise<StageGroupResponseDto> {
    const items = await itemsRepository.find({
      where: { stageGroupId: group.id },
      order: { orderIndex: 'ASC', id: 'ASC' },
    });
    return StageGroupResponseDto.fromEntities(group, items);
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
    if (duplicate) {
      throw new ConflictException('Stage group code already exists');
    }
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

  private ensureOrderIndices(
    items: Array<Pick<CreateStageGroupItemDto, 'orderIndex'>>,
  ): void {
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

  private ensureUniqueItemIds(items: UpdateStageGroupItemDto[]): void {
    const itemIds = items.flatMap((item) => (item.id ? [item.id] : []));
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException(
        'Stage group items cannot contain duplicate IDs',
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
