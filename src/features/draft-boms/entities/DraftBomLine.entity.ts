import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('draft_bom_lines')
export class DraftBomLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'version_id' })
  versionId: string;

  @Column({ type: 'uuid', nullable: true, name: 'material_id' })
  materialId: string;

  @Column({ type: 'varchar', length: 255, name: 'material_name_snapshot' })
  materialNameSnapshot: string;

  @Column({ type: 'uuid', nullable: true, name: 'material_group_id' })
  materialGroupId: string;

  @Column({ type: 'uuid', nullable: true, name: 'unit_id' })
  unitId: string;

  @Column({ type: 'numeric', precision: 18, scale: 6 })
  consumption: number;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex: number;
}
