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
import { SizeChart } from '../entities/SizeChart.entity';
import { SizeChartItem } from '../entities/SizeChartItem.entity';
import { CreateSizeChartDto } from './dto/create-size-chart.dto';
import { QuerySizeChartsDto } from './dto/query-size-charts.dto';
import { SizeChartResponseDto } from './dto/size-chart-response.dto';
import { normalizeSizeChartTextValue } from './dto/size-chart-dto.transforms';
import { UpdateSizeChartStatusDto } from './dto/update-size-chart-status.dto';
import { UpdateSizeChartDto } from './dto/update-size-chart.dto';

type SizeChartRepositories = {
  charts: Repository<SizeChart>;
  items: Repository<SizeChartItem>;
};

const SIZE_CHART_NAME_CONSTRAINTS = new Set([
  'size_charts_name_key',
  'uq_size_charts_name_normalized',
]);

@Injectable()
export class SizeChartsService {
  constructor(
    @InjectRepository(SizeChart)
    private readonly charts: Repository<SizeChart>,
    @InjectRepository(SizeChartItem)
    private readonly items: Repository<SizeChartItem>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: QuerySizeChartsDto): Promise<SizeChartResponseDto[]> {
    const where: FindOptionsWhere<SizeChart> = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search?.trim()
        ? { name: ILike(`%${query.search.trim()}%`) }
        : {}),
    };
    const charts = await this.charts.find({
      where,
      order: { name: 'ASC', id: 'ASC' },
    });
    if (charts.length === 0) return [];

    const items = await this.items.find({
      where: { sizeChartId: In(charts.map((chart) => chart.id)) },
      order: { orderIndex: 'ASC', id: 'ASC' },
    });
    const itemsByChartId = new Map<string, SizeChartItem[]>();
    for (const item of items) {
      const ownedItems = itemsByChartId.get(item.sizeChartId) ?? [];
      ownedItems.push(item);
      itemsByChartId.set(item.sizeChartId, ownedItems);
    }

    return charts.map((chart) =>
      SizeChartResponseDto.fromEntities(
        chart,
        itemsByChartId.get(chart.id) ?? [],
      ),
    );
  }

  async findOne(id: string): Promise<SizeChartResponseDto> {
    return this.loadResponse({ charts: this.charts, items: this.items }, id);
  }

  async create(dto: CreateSizeChartDto): Promise<SizeChartResponseDto> {
    const name = normalizeSizeChartTextValue(dto.name);
    const sizes = this.normalizeAndValidateSizes(dto.sizes);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const repositories = this.getRepositories(manager);
        await this.ensureNameUnique(repositories.charts, name);
        const chart = repositories.charts.create({
          name,
          status: RecordStatus.ACTIVE,
        });
        const savedChart = await repositories.charts.save(chart);
        const items = sizes.map((sizeLabel, orderIndex) =>
          repositories.items.create({
            sizeChartId: savedChart.id,
            sizeLabel,
            orderIndex,
          }),
        );
        await repositories.items.save(items);
        return this.loadResponse(repositories, savedChart.id);
      });
    } catch (error) {
      this.rethrowUniqueNameConflict(error);
    }
  }

  async update(
    id: string,
    dto: UpdateSizeChartDto,
  ): Promise<SizeChartResponseDto> {
    const sizes =
      dto.sizes === undefined
        ? undefined
        : this.normalizeAndValidateSizes(dto.sizes);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const repositories = this.getRepositories(manager);
        const chart = await this.getExistingChart(repositories.charts, id);
        if (dto.name !== undefined) {
          const name = normalizeSizeChartTextValue(dto.name);
          if (name !== chart.name) {
            await this.ensureNameUnique(repositories.charts, name, chart.id);
            chart.name = name;
          }
        }
        await repositories.charts.save(chart);

        if (sizes !== undefined) {
          await repositories.items.delete({ sizeChartId: chart.id });
          const replacementItems = sizes.map((sizeLabel, orderIndex) =>
            repositories.items.create({
              sizeChartId: chart.id,
              sizeLabel,
              orderIndex,
            }),
          );
          await repositories.items.save(replacementItems);
        }
        return this.loadResponse(repositories, chart.id);
      });
    } catch (error) {
      this.rethrowUniqueNameConflict(error);
    }
  }

  async updateStatus(
    id: string,
    dto: UpdateSizeChartStatusDto,
  ): Promise<SizeChartResponseDto> {
    const chart = await this.getExistingChart(this.charts, id);
    chart.status = dto.status;
    try {
      const savedChart = await this.charts.save(chart);
      return this.loadResponse(
        { charts: this.charts, items: this.items },
        savedChart.id,
      );
    } catch (error) {
      this.rethrowUniqueNameConflict(error);
    }
  }

  async remove(id: string): Promise<void> {
    const chart = await this.getExistingChart(this.charts, id);
    try {
      await this.charts.remove(chart);
    } catch (error) {
      if (this.getDatabaseErrorValue(error, 'code') === '23503') {
        throw new ConflictException(
          'Size chart cannot be deleted because it is referenced by business data',
        );
      }
      throw error;
    }
  }

  private getRepositories(manager: EntityManager): SizeChartRepositories {
    return {
      charts: manager.getRepository(SizeChart),
      items: manager.getRepository(SizeChartItem),
    };
  }

  private async loadResponse(
    repositories: SizeChartRepositories,
    id: string,
  ): Promise<SizeChartResponseDto> {
    const chart = await this.getExistingChart(repositories.charts, id);
    const items = await repositories.items.find({
      where: { sizeChartId: chart.id },
      order: { orderIndex: 'ASC', id: 'ASC' },
    });
    return SizeChartResponseDto.fromEntities(chart, items);
  }

  private async getExistingChart(
    repository: Repository<SizeChart>,
    id: string,
  ): Promise<SizeChart> {
    const chart = await repository.findOneBy({ id });
    if (!chart) throw new NotFoundException('Size chart not found');
    return chart;
  }

  private async ensureNameUnique(
    repository: Repository<SizeChart>,
    name: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await repository
      .createQueryBuilder('sizeChart')
      .where('LOWER(BTRIM(sizeChart.name)) = LOWER(BTRIM(:name))', { name })
      .getOne();
    if (existing && existing.id !== excludedId) {
      throw new ConflictException('Size chart name already exists');
    }
  }

  private normalizeAndValidateSizes(sizes: string[]): string[] {
    const normalized = sizes
      .map((size) => normalizeSizeChartTextValue(size))
      .filter(Boolean);
    if (normalized.length === 0) {
      throw new BadRequestException(
        'Size chart must contain at least one size',
      );
    }
    const normalizedKeys = normalized.map((size) => size.toUpperCase());
    if (new Set(normalizedKeys).size !== normalizedKeys.length) {
      throw new BadRequestException(
        'Size chart cannot contain duplicate sizes',
      );
    }
    return normalized;
  }

  private rethrowUniqueNameConflict(error: unknown): never {
    const code = this.getDatabaseErrorValue(error, 'code');
    const constraint = this.getDatabaseErrorValue(error, 'constraint');
    if (
      code === '23505' &&
      typeof constraint === 'string' &&
      SIZE_CHART_NAME_CONSTRAINTS.has(constraint)
    ) {
      throw new ConflictException('Size chart name already exists');
    }
    throw error;
  }

  private getDatabaseErrorValue(
    error: unknown,
    field: 'code' | 'constraint',
  ): unknown {
    if (typeof error !== 'object' || error === null) return undefined;
    const databaseError = error as Record<string, unknown>;
    if (databaseError[field] !== undefined) return databaseError[field];
    const driverError = databaseError.driverError;
    return typeof driverError === 'object' && driverError !== null
      ? (driverError as Record<string, unknown>)[field]
      : undefined;
  }
}
