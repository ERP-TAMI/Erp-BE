import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('production_document_size_rows')
export class ProductionDocumentSizeRow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'production_document_id' })
  productionDocumentId: string;

  @Column({ type: 'varchar', length: 30, name: 'size_label' })
  sizeLabel: string;

  @Column({ type: 'varchar', length: 255, name: 'measurement_name' })
  measurementName: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'measurement_value',
  })
  measurementValue: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tolerance: string;

  @Column({ type: 'int', default: 0, name: 'order_index' })
  orderIndex: number;
}
