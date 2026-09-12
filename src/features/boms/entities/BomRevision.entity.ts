import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { BillOfMaterials } from './BillOfMaterials.entity';
import { BillOfMaterialLine } from './BillOfMaterialLine.entity';
import { FitBomRevision } from '../../fit-boms/entities/FitBomRevision.entity';
import { RevisionStatus } from '../../../common/enums/database.enums';

@Entity('bom_revisions')
export class BomRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'bill_of_material_id' })
  billOfMaterialId: string;

  @Column({ type: 'int', name: 'revision_no' })
  revisionNo: number;

  @Column({
    type: 'enum',
    enum: RevisionStatus,
    enumName: 'revision_status',
    default: RevisionStatus.DRAFT,
  })
  status: RevisionStatus;

  @Column({
    type: 'uuid',
    nullable: true,
    name: 'source_fit_bom_revision_id',
  })
  sourceFitBomRevisionId: string | null;

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

  @ManyToOne(() => BillOfMaterials, (bom) => bom.revisions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'bill_of_material_id' })
  billOfMaterial: BillOfMaterials;

  @ManyToOne(() => FitBomRevision, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'source_fit_bom_revision_id' })
  sourceFitBomRevision: FitBomRevision | null;

  @OneToMany(() => BillOfMaterialLine, (line) => line.revision)
  lines: BillOfMaterialLine[];
}
