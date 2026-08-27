import { ApiProperty } from '@nestjs/swagger';
import { RecordStatus } from '../../../../common/enums/database.enums';
import { SizeChart } from '../../entities/SizeChart.entity';
import { SizeChartItem } from '../../entities/SizeChartItem.entity';

export class SizeChartResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, isArray: true })
  sizes: string[];

  @ApiProperty({ enum: RecordStatus })
  status: RecordStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  static fromEntities(
    chart: SizeChart,
    items: SizeChartItem[],
  ): SizeChartResponseDto {
    return {
      id: chart.id,
      name: chart.name,
      sizes: items
        .slice()
        .sort(
          (left, right) =>
            left.orderIndex - right.orderIndex ||
            left.id.localeCompare(right.id),
        )
        .map((item) => item.sizeLabel),
      status: chart.status,
      createdAt: chart.createdAt,
      updatedAt: chart.updatedAt,
    };
  }
}
