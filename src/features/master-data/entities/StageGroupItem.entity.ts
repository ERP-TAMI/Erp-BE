import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { RecordStatus } from '../../../common/enums/database.enums';

@Entity('stage_group_items')
@Unique('uq_stage_group_order', ['stageGroupId', 'orderIndex'])
export class StageGroupItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'stage_group_id' })
  stageGroupId: string;

  @Column({ type: 'varchar', length: 255, name: 'item_name' })
  itemName: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 3 })
  /** PostgreSQL numeric is hydrated as a string to preserve precision. */
  ssv: string;

  @Column({
    type: 'enum',
    enum: RecordStatus,
    enumName: 'record_status',
    default: RecordStatus.ACTIVE,
  })
  status: RecordStatus;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex: number;
}
