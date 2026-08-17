import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('bill_of_material_lines')
export class BillOfMaterialLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'bill_of_material_id' })
  billOfMaterialId: string;

  @Column({ type: 'uuid', name: 'material_id' })
  materialId: string;

  @Column({ type: 'varchar', length: 255, name: 'material_name_snapshot' })
  materialNameSnapshot: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'material_group_snapshot',
  })
  materialGroupSnapshot: string;

  @Column({ type: 'varchar', length: 50, name: 'unit_snapshot' })
  unitSnapshot: string;

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
