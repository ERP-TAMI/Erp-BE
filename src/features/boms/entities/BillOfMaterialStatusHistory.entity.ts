import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { BomStatus } from '../../../common/enums/database.enums';

@Entity('bill_of_material_status_history')
export class BillOfMaterialStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'bill_of_material_id' })
  billOfMaterialId: string;

  @Column({
    type: 'enum',
    enum: BomStatus,
    enumName: 'bom_status',
    nullable: true,
    name: 'old_status',
  })
  oldStatus: BomStatus;

  @Column({
    type: 'enum',
    enum: BomStatus,
    enumName: 'bom_status',
    name: 'new_status',
  })
  newStatus: BomStatus;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'uuid', nullable: true, name: 'changed_by' })
  changedBy: string;

  @Column({ type: 'timestamptz', name: 'changed_at' })
  changedAt: Date;
}
