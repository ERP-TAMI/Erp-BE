import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  Unique,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BomRevision } from './BomRevision.entity';

@Entity('bom_lines')
@Unique('uq_bom_line_order', ['revisionId', 'orderIndex'])
@Index('ix_bom_lines_revision', ['revisionId', 'orderIndex'])
@Index('uq_bom_line_material', ['revisionId', 'materialId'], {
  unique: true,
  where: 'material_id IS NOT NULL',
})
export class BomLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'revision_id' })
  revisionId: string;

  @ManyToOne(() => BomRevision, (rev) => rev.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'revision_id' })
  revision?: BomRevision;

  @Column({ type: 'uuid', nullable: true, name: 'material_id' })
  materialId: string | null;

  @Column({ type: 'varchar', length: 255, name: 'material_name_snapshot' })
  materialNameSnapshot: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'material_group_snapshot',
  })
  materialGroupSnapshot: string | null;

  @Column({ type: 'varchar', length: 50, name: 'unit_snapshot' })
  unitSnapshot: string;

  @Column({ type: 'uuid', nullable: true, name: 'material_group_id' })
  materialGroupId: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'unit_id' })
  unitId: string | null;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 6,
    name: 'consumption',
  })
  consumption: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    name: 'unit_cost',
  })
  unitCost: number | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex: number;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
