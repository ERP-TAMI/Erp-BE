import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { ProductStatus } from '../../../common/enums/database.enums';

@Entity('purchase_order_products')
export class PurchaseOrderProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'purchase_order_id' })
  purchaseOrderId: string;

  @Column({ type: 'uuid', nullable: true, name: 'source_style_id' })
  sourceStyleId: string;

  @Column({ type: 'varchar', length: 100, name: 'product_code' })
  productCode: string;

  @Column({ type: 'varchar', length: 255, name: 'product_name' })
  productName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string;

  @Column({ type: 'text', nullable: true, name: 'material_note' })
  materialNote: string;

  @Column({ type: 'date', nullable: true })
  deadline: Date;

  @Column({ type: 'uuid', nullable: true, name: 'structure_image_version_id' })
  structureImageVersionId: string;

  @Column({ type: 'enum', enum: ProductStatus, enumName: 'product_status' })
  status: ProductStatus;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    enumName: 'product_status',
    nullable: true,
    name: 'previous_status',
  })
  previousStatus: ProductStatus;

  @Column({ type: 'text', nullable: true, name: 'cancellation_reason' })
  cancellationReason: string;

  @Column({ type: 'timestamptz', nullable: true, name: 'closed_at' })
  closedAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'closed_by' })
  closedBy: string;

  @Column({ type: 'bigint', default: 1, name: 'row_version' })
  rowVersion: number;

  @Column({ type: 'int', default: 30, name: 'as3b_cm_base_days' })
  as3bCmBaseDays: number;

  @Column({ type: 'timestamptz', nullable: true, name: 'imported_at' })
  importedAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'imported_by' })
  importedBy: string;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'updated_by' })
  updatedBy: string;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
