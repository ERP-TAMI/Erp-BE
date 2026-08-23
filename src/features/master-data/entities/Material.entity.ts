import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { RecordStatus } from '../../../common/enums/database.enums';

@Entity('materials')
export class Material {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, name: 'material_code' })
  materialCode: string;

  @Column({ type: 'varchar', length: 255, name: 'material_name' })
  materialName: string;

  @Column({ type: 'uuid', nullable: true, name: 'material_group_id' })
  materialGroupId: string;

  @Column({ type: 'uuid', nullable: true, name: 'default_unit_id' })
  defaultUnitId: string;

  @Column({
    type: 'numeric',
    precision: 8,
    scale: 4,
    default: 0,
    nullable: false,
    name: 'default_yield_pct',
  })
  defaultYieldPct: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    nullable: false,
    name: 'last_unit_cost',
  })
  lastUnitCost: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    default: 0,
    nullable: false,
    name: 'current_stock',
  })
  currentStock: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    default: 10,
    nullable: false,
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
