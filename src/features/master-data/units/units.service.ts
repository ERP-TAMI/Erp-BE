import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecordStatus } from '../../../common/enums/database.enums';
import { Unit } from '../entities/Unit.entity';
import { CreateUnitDto } from './dto/create-unit.dto';
import { QueryUnitsDto } from './dto/query-units.dto';
import { UnitResponseDto } from './dto/unit-response.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UpdateUnitStatusDto } from './dto/update-unit-status.dto';

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(Unit)
    private readonly units: Repository<Unit>,
  ) {}

  async findAll(
    query: QueryUnitsDto,
  ): Promise<PaginatedResult<UnitResponseDto>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(100, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const qb = this.units.createQueryBuilder('unit');
    if (query.status) {
      qb.andWhere('unit.status = :status', { status: query.status });
    }
    const search = query.search?.trim();
    if (search) {
      qb.andWhere('unit.name ILIKE :search', { search: `%${search}%` });
    }
    qb.orderBy('unit.name', 'ASC').addOrderBy('unit.id', 'ASC');
    qb.skip(skip).take(limit);

    const [units, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: units.map(UnitResponseDto.fromEntity),
      meta: { total, page, limit, totalPages },
    };
  }

  async create(dto: CreateUnitDto): Promise<UnitResponseDto> {
    const unit = this.units.create({
      name: dto.name,
      status: RecordStatus.ACTIVE,
    });
    return UnitResponseDto.fromEntity(await this.units.save(unit));
  }

  async update(id: string, dto: UpdateUnitDto): Promise<UnitResponseDto> {
    const unit = await this.getExistingUnit(id);
    if (dto.name !== undefined) {
      unit.name = dto.name;
    }
    return UnitResponseDto.fromEntity(await this.units.save(unit));
  }

  async updateStatus(
    id: string,
    dto: UpdateUnitStatusDto,
  ): Promise<UnitResponseDto> {
    const unit = await this.getExistingUnit(id);
    unit.status = dto.status;
    return UnitResponseDto.fromEntity(await this.units.save(unit));
  }

  async remove(id: string): Promise<void> {
    const unit = await this.getExistingUnit(id);
    try {
      await this.units.remove(unit);
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Unit cannot be deleted because it is referenced by business data',
        );
      }
      throw error;
    }
  }

  private async getExistingUnit(id: string): Promise<Unit> {
    const unit = await this.units.findOneBy({ id });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    return unit;
  }

  private isForeignKeyViolation(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === '23503'
    );
  }
}
