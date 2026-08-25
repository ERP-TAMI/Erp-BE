import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('stage_group_items')
export class StageGroupItem {
  @PrimaryColumn({ type: 'uuid', name: 'stage_group_id' })
  stageGroupId: string;

  @PrimaryColumn({ type: 'uuid', name: 'stage_id' })
  stageId: string;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex: number;

  @Column({ type: 'varchar', length: 255, name: 'name_snapshot' })
  nameSnapshot: string;

  @Column({ type: 'text', nullable: true, name: 'description_snapshot' })
  descriptionSnapshot: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 3, name: 'ssv_snapshot' })
  /**
   * PostgreSQL numeric values are hydrated as strings to preserve decimal
   * precision. Convert explicitly at the boundary of downstream calculations.
   */
  ssvSnapshot: string;
}
