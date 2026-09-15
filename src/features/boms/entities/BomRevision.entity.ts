import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  Unique,
} from 'typeorm';
import { BomRevisionStatus } from '../../../common/enums/database.enums';

@Entity('bom_revisions')
@Unique('uq_bom_revision', ['bomId', 'revisionNo'])
@Unique('uq_bom_revision_id_bom', ['id', 'bomId'])
@Index('ix_bom_revisions_bom', ['bomId', 'revisionNo'])
@Index('ix_bom_revisions_status', ['bomId', 'status'])
export class BomRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'bom_id' })
  bomId: string;

  @Column({ type: 'int', name: 'revision_no' })
  revisionNo: number;

  @Column({
    type: 'enum',
    enum: BomRevisionStatus,
    enumName: 'bom_revision_status',
    default: BomRevisionStatus.WAIT_NVKH,
  })
  status: BomRevisionStatus;

  @Column({ type: 'uuid', nullable: true, name: 'source_revision_id' })
  sourceRevisionId: string | null;

  @Column({ type: 'text', nullable: true, name: 'change_reason' })
  changeReason: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string | null;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'approved_by' })
  approvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'approved_at' })
  approvedAt: Date | null;

  @Column({ type: 'bigint', default: 1, name: 'row_version' })
  rowVersion: number;
}
