import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('style_operation_steps')
export class StyleOperationStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'style_id' })
  styleId: string;

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
