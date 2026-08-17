import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { PoStatus } from '../../../common/enums/database.enums';

@Entity('purchase_orders')
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, name: 'po_code' })
  poCode: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'customer_po_code',
  })
  customerPoCode: string;

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId: string;

  @Column({ type: 'varchar', length: 255, name: 'customer_name_snapshot' })
  customerNameSnapshot: string;

  @Column({ type: 'date', name: 'received_date' })
  receivedDate: Date;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ type: 'enum', enum: PoStatus, enumName: 'po_status' })
  status: PoStatus;

  @Column({ type: 'text', nullable: true, name: 'cancellation_reason' })
  cancellationReason: string;

  @Column({ type: 'timestamptz', nullable: true, name: 'closed_at' })
  closedAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'closed_by' })
  closedBy: string;

  @Column({ type: 'bigint', default: 1, name: 'row_version' })
  rowVersion: number;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'updated_by' })
  updatedBy: string;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'archived_at' })
  archivedAt: Date;
}
