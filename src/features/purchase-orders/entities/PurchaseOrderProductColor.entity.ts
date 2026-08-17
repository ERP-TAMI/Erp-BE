import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('purchase_order_product_colors')
export class PurchaseOrderProductColor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'product_id' })
  productId: string;

  @Column({ type: 'varchar', length: 100, name: 'color_name' })
  colorName: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'color_code' })
  colorCode: string;

  @Column({ type: 'int', default: 0, name: 'order_index' })
  orderIndex: number;
}
