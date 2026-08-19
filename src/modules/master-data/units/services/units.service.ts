import { Injectable } from '@nestjs/common';
import { QueryUnitsDto } from '../dto/request/query-units.dto';
import { UnitResponseDto } from '../dto/response/unit-response.dto';
import { UnitsRepository } from '../repositories/units.repository';

@Injectable()
export class UnitsService {
  constructor(private readonly unitsRepository: UnitsRepository) {}

  async findAll(query: QueryUnitsDto): Promise<UnitResponseDto[]> {
    const units = await this.unitsRepository.findAll(query.status);
    return units.map(UnitResponseDto.fromEntity);
  }
}
