import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('purchase_order_product_color_sizes')
export class PurchaseOrderProductColorSize {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'product_color_id' })
  productColorId: string;

  @Column({ type: 'varchar', length: 30, name: 'size_label' })
  sizeLabel: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'int', default: 0, name: 'order_index' })
  orderIndex: number;
}
