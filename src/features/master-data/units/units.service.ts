import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecordStatus } from '../../../common/enums/database.enums';
import { Unit } from '../entities/Unit.entity';
import { CreateUnitDto } from './dto/create-unit.dto';
import { QueryUnitsDto } from './dto/query-units.dto';
import { UnitResponseDto } from './dto/unit-response.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UpdateUnitStatusDto } from './dto/update-unit-status.dto';

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(Unit)
    private readonly units: Repository<Unit>,
  ) {}

  async findAll(query: QueryUnitsDto): Promise<UnitResponseDto[]> {
    const units = await this.units.find({
      where: query.status ? { status: query.status } : {},
      order: { name: 'ASC', id: 'ASC' },
    });
    return units.map(UnitResponseDto.fromEntity);
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
