import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { RecordStatus } from '../../../common/enums/database.enums';

@Entity('material_sizes')
export class MaterialSize {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'material_id' })
  materialId: string;

  @Column({ type: 'varchar', length: 20, name: 'size_code' })
  sizeCode: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  barcode: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    name: 'unit_cost',
  })
  unitCost: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    default: 0,
    name: 'current_stock',
  })
  currentStock: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    default: 10,
    name: 'low_stock_threshold',
  })
  lowStockThreshold: number;

  @Column({ type: 'enum', enum: RecordStatus, enumName: 'record_status' })
  status: RecordStatus;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
