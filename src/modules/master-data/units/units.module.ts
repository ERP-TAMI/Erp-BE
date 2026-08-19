import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Unit } from '../../../features/master-data/entities/Unit.entity';
import { UnitsController } from './controllers/units.controller';
import { UnitsRepository } from './repositories/units.repository';
import { UnitsService } from './services/units.service';

@Module({
  imports: [TypeOrmModule.forFeature([Unit])],
  controllers: [UnitsController],
  providers: [UnitsService, UnitsRepository],
})
export class UnitsModule {}
