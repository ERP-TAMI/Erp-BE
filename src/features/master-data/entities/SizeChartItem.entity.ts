import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('size_chart_items')
export class SizeChartItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'size_chart_id' })
  sizeChartId: string;

  @Column({ type: 'varchar', length: 30, name: 'size_label' })
  sizeLabel: string;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex: number;
}
