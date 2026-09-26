import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BomRevisionStatus } from '../../../common/enums/database.enums';
import { BomRevision } from './BomRevision.entity';

@Entity('bom_revision_status_history')
@Index('ix_bom_revision_status_history', ['revisionId', 'changedAt', 'id'])
export class BomRevisionStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'revision_id' })
  revisionId: string;

  @ManyToOne(() => BomRevision, (rev) => rev.statusHistory, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'revision_id' })
  revision?: BomRevision;

  @Column({
    type: 'enum',
    enum: BomRevisionStatus,
    enumName: 'bom_revision_status',
    nullable: true,
    name: 'old_status',
  })
  oldStatus: BomRevisionStatus | null;

  @Column({
    type: 'enum',
    enum: BomRevisionStatus,
    enumName: 'bom_revision_status',
    name: 'new_status',
  })
  newStatus: BomRevisionStatus;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'changed_by' })
  changedBy: string | null;

  @Column({ type: 'timestamptz', name: 'changed_at' })
  changedAt: Date;
}
