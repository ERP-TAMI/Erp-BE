import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

const numericColumnTransformer = {
  to: (val: number) => val,
  from: (val: string | number | null) =>
    val !== null && val !== undefined ? Number(val) : 0,
};

@Entity('style_operation_steps')
export class StyleOperationStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'style_id' })
  styleId: string;

  @Column({ type: 'uuid', nullable: true, name: 'parent_step_id' })
  parentStepId: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'stage_id' })
  stageId: string | null;

  @Column({ type: 'varchar', length: 255, name: 'step_name' })
  stepName: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 3,
    default: 0,
    name: 'time_per_piece',
    transformer: numericColumnTransformer,
  })
  timePerPiece: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 3,
    default: 0,
    transformer: numericColumnTransformer,
  })
  ssv: number;

  @Column({ type: 'int', default: 0, name: 'target_total' })
  targetTotal: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex: number;

  @Column({ type: 'boolean', default: false, name: 'is_group' })
  isGroup: boolean;

  @Column({ type: 'uuid', nullable: true, name: 'group_id' })
  groupId: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'group_items' })
  groupItems: Record<string, unknown>[] | null;
}
