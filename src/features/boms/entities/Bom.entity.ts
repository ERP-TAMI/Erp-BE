import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { BomType } from '../../../common/enums/database.enums';
import { Style } from '../../styles/entities/Style.entity';
import { PurchaseOrderProduct } from '../../purchase-orders/entities/PurchaseOrderProduct.entity';
import { BomRevision } from './BomRevision.entity';

@Entity('boms')
@Index('ix_boms_type_created', ['bomType', 'createdAt', 'id'])
@Index('uq_boms_fit_style', ['styleId'], {
  unique: true,
  where: "bom_type = 'fit' AND style_id IS NOT NULL",
})
@Index('uq_boms_po_product', ['purchaseOrderProductId'], {
  unique: true,
  where: "bom_type = 'po' AND purchase_order_product_id IS NOT NULL",
})
export class Bom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true, name: 'bom_code' })
  bomCode: string;

  @Column({
    type: 'enum',
    enum: BomType,
    enumName: 'bom_type',
    name: 'bom_type',
  })
  bomType: BomType;

  @Column({ type: 'uuid', nullable: true, name: 'style_id' })
  styleId: string | null;

  @ManyToOne(() => Style, { nullable: true })
  @JoinColumn({ name: 'style_id' })
  style?: Style | null;

  @Column({
    type: 'uuid',
    nullable: true,
    name: 'purchase_order_product_id',
  })
  purchaseOrderProductId: string | null;

  @ManyToOne(() => PurchaseOrderProduct, { nullable: true })
  @JoinColumn({ name: 'purchase_order_product_id' })
  purchaseOrderProduct?: PurchaseOrderProduct | null;

  @Column({ type: 'uuid', nullable: true, name: 'current_revision_id' })
  currentRevisionId: string | null;

  @ManyToOne(() => BomRevision, { nullable: true })
  @JoinColumn({ name: 'current_revision_id' })
  currentRevision?: BomRevision | null;

  @OneToMany(() => BomRevision, (rev) => rev.bom)
  revisions?: BomRevision[];

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'product_code_snapshot',
  })
  productCodeSnapshot: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'product_name_snapshot',
  })
  productNameSnapshot: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'color_name_snapshot',
  })
  colorNameSnapshot: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    name: 'po_code_snapshot',
  })
  poCodeSnapshot: string | null;

  @Column({
    type: 'int',
    nullable: true,
    name: 'order_quantity_snapshot',
  })
  orderQuantitySnapshot: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  deadline: Date | null;

  @Column({ type: 'text', nullable: true, name: 'rd_note' })
  rdNote: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'discontinued_at' })
  discontinuedAt: Date | null;

  @Column({ type: 'uuid', nullable: true, name: 'discontinued_by' })
  discontinuedBy: string | null;

  @Column({ type: 'text', nullable: true, name: 'discontinued_reason' })
  discontinuedReason: string | null;

  @Column({ type: 'bigint', default: 1, name: 'row_version' })
  rowVersion: number;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string | null;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'updated_by' })
  updatedBy: string | null;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
