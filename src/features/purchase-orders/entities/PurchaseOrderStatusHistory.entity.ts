import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { PoStatus } from '../../../common/enums/database.enums';

@Entity('purchase_order_status_history')
export class PurchaseOrderStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'purchase_order_id' })
  purchaseOrderId: string;

  @Column({
    type: 'enum',
    enum: PoStatus,
    enumName: 'po_status',
    nullable: true,
    name: 'old_status',
  })
  oldStatus: PoStatus;

  @Column({
    type: 'enum',
    enum: PoStatus,
    enumName: 'po_status',
    name: 'new_status',
  })
  newStatus: PoStatus;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'uuid', nullable: true, name: 'changed_by' })
  changedBy: string;

  @Column({ type: 'timestamptz', name: 'changed_at' })
  changedAt: Date;
}
