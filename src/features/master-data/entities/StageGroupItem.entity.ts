import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('stage_group_items')
export class StageGroupItem {
  @PrimaryColumn({ type: 'uuid' })
  stageGroupId: string;

  @PrimaryColumn({ type: 'uuid' })
  stageId: string;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex: number;

  @Column({ type: 'varchar', length: 255, name: 'name_snapshot' })
  nameSnapshot: string;

  @Column({ type: 'text', nullable: true, name: 'description_snapshot' })
  descriptionSnapshot: string;

  @Column({ type: 'numeric', precision: 12, scale: 3, name: 'ssv_snapshot' })
  ssvSnapshot: number;
}
