import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Unit } from '../entities/Unit.entity';
import { QueryUnitsDto } from './dto/query-units.dto';
import { UnitResponseDto } from './dto/unit-response.dto';

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(Unit)
    private readonly units: Repository<Unit>,
  ) {}

  async findAll(query: QueryUnitsDto): Promise<UnitResponseDto[]> {
    const units = await this.units.find({
      where: query.status ? { status: query.status } : {},
      order: { code: 'ASC', id: 'ASC' },
    });
    return units.map(UnitResponseDto.fromEntity);
  }
}
