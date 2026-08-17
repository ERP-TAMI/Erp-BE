import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('draft_bom_versions')
export class DraftBomVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'family_id' })
  familyId: string;

  @Column({ type: 'uuid', nullable: true, name: 'parent_version_id' })
  parentVersionId: string;

  @Column({ type: 'int', name: 'version_no' })
  versionNo: number;

  @Column({ type: 'text', nullable: true, name: 'change_reason' })
  changeReason: string;

  @Column({ type: 'boolean', default: false, name: 'is_current' })
  isCurrent: boolean;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
