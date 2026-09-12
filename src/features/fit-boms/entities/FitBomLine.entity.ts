import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('fit_bom_lines')
export class FitBomLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'style_id' })
  styleId: string;

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
