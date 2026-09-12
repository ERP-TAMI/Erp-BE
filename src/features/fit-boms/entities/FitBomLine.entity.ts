import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { FitBomRevision } from './FitBomRevision.entity';

@Entity('fit_bom_lines')
export class FitBomLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'revision_id' })
  revisionId: string;

  @ManyToOne(() => FitBomRevision, (rev) => rev.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'revision_id' })
  revision: FitBomRevision;

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

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    name: 'unit_snapshot',
  })
  unitSnapshot: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'material_group_id' })
  materialGroupId: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'unit_id' })
  unitId: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 6 })
  consumption: number;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    name: 'waste_percent',
  })
  wastePercent: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex: number;

  @Column({
    type: 'timestamptz',
    name: 'created_at',
    default: () => 'now()',
  })
  createdAt: Date;

  @Column({
    type: 'timestamptz',
    name: 'updated_at',
    default: () => 'now()',
  })
  updatedAt: Date;
}
