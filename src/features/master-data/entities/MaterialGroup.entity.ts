import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { RecordStatus } from '../../../common/enums/database.enums';

@Entity('material_groups')
export class MaterialGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'integer', name: 'display_order', default: 0 })
  displayOrder: number;

  @Column({ type: 'enum', enum: RecordStatus, enumName: 'record_status' })
  status: RecordStatus;
}
