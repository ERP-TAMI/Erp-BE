import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('purchase_order_product_operation_steps')
export class PurchaseOrderProductOperationStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'product_id' })
  productId: string;

  @Column({ type: 'uuid', nullable: true, name: 'source_style_step_id' })
  sourceStyleStepId: string;

  @Column({ type: 'uuid', nullable: true, name: 'parent_step_id' })
  parentStepId: string;

  @Column({ type: 'uuid', nullable: true, name: 'stage_id' })
  stageId: string;

  @Column({ type: 'varchar', length: 255, name: 'step_name' })
  stepName: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 3,
    default: 0,
    name: 'time_per_piece',
  })
  timePerPiece: number;

  @Column({ type: 'numeric', precision: 12, scale: 3, default: 0 })
  ssv: number;

  @Column({ type: 'int', default: 0, name: 'target_total' })
  targetTotal: number;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex: number;

  @Column({ type: 'boolean', default: false, name: 'is_group' })
  isGroup: boolean;
}
