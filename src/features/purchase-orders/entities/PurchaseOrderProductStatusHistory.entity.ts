import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { ProductStatus } from '../../../common/enums/database.enums';

@Entity('purchase_order_product_status_history')
export class PurchaseOrderProductStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'product_id' })
  productId: string;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    enumName: 'product_status',
    nullable: true,
    name: 'old_status',
  })
  oldStatus: ProductStatus;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    enumName: 'product_status',
    name: 'new_status',
  })
  newStatus: ProductStatus;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'uuid', nullable: true, name: 'changed_by' })
  changedBy: string;

  @Column({ type: 'timestamptz', name: 'changed_at' })
  changedAt: Date;
}
