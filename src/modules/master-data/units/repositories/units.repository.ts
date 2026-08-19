import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { Unit } from '../../../../features/master-data/entities/Unit.entity';

@Injectable()
export class UnitsRepository {
  constructor(
    @InjectRepository(Unit)
    private readonly units: Repository<Unit>,
  ) {}

  findAll(status?: RecordStatus): Promise<Unit[]> {
    return this.units.find({
      where: status ? { status } : {},
      order: { code: 'ASC' },
    });
  }
}
