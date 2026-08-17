import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { RecordStatus } from '../../../common/enums/database.enums';

@Entity('units')
export class Unit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'smallint', default: 4, name: 'decimal_scale' })
  decimalScale: number;

  @Column({ type: 'enum', enum: RecordStatus, enumName: 'record_status' })
  status: RecordStatus;
}
