import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SizeChart } from '../entities/SizeChart.entity';
import { SizeChartItem } from '../entities/SizeChartItem.entity';
import { SizeChartsController } from './size-charts.controller';
import { SizeChartsService } from './size-charts.service';

@Module({
  imports: [TypeOrmModule.forFeature([SizeChart, SizeChartItem])],
  controllers: [SizeChartsController],
  providers: [SizeChartsService],
})
export class SizeChartsModule {}
