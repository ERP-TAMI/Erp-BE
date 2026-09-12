import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Style } from '../../styles/entities/Style.entity';
import { FitBomLine } from './FitBomLine.entity';
import { RevisionStatus } from '../../../common/enums/database.enums';

@Entity('fit_bom_revisions')
export class FitBomRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'style_id' })
  styleId: string;

  @Column({ type: 'int', name: 'revision_no' })
  revisionNo: number;

  @Column({
    type: 'enum',
    enum: RevisionStatus,
    enumName: 'revision_status',
    default: RevisionStatus.DRAFT,
  })
  status: RevisionStatus;

  @Column({ type: 'date', nullable: true, name: 'effective_from' })
  effectiveFrom: string | null;

  @Column({ type: 'date', nullable: true, name: 'effective_to' })
  effectiveTo: string | null;

  @Column({ type: 'text', nullable: true, name: 'change_reason' })
  changeReason: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'approved_by' })
  approvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'approved_at' })
  approvedAt: Date | null;

  @Column({ type: 'bigint', default: 1, name: 'row_version' })
  rowVersion: number;

  @ManyToOne(() => Style, (style) => style.fitBomRevisions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'style_id' })
  style: Style;

  @OneToMany(() => FitBomLine, (line) => line.revision)
  lines: FitBomLine[];
}
