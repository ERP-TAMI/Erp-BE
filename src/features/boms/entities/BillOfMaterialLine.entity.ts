import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BomRevision } from './BomRevision.entity';

@Entity('bill_of_material_lines')
export class BillOfMaterialLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'revision_id' })
  revisionId: string;

  @ManyToOne(() => BomRevision, (rev) => rev.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'revision_id' })
  revision: BomRevision;

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
    nullable: true,
    name: 'consumption_per_unit',
  })
  consumptionPerUnit: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    name: 'unit_cost',
  })
  unitCost: number;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex: number;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
