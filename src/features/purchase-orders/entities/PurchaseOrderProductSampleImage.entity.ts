import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('purchase_order_product_sample_images')
export class PurchaseOrderProductSampleImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'sample_round_id' })
  sampleRoundId: string;

  @Column({ type: 'uuid', nullable: true, name: 'product_color_id' })
  productColorId: string;

  @Column({ type: 'uuid', name: 'document_version_id' })
  documentVersionId: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'color_name_snapshot',
  })
  colorNameSnapshot: string;

  @Column({ type: 'int', default: 0, name: 'order_index' })
  orderIndex: number;
}
