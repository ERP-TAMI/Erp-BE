import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { RecordStatus } from '../../../common/enums/database.enums';

@Entity('stages')
export class Stage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, name: 'stage_code' })
  stageCode: string;

  @Column({ type: 'varchar', length: 255, name: 'stage_name' })
  stageName: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 3,
    default: 0,
    name: 'default_ssv',
  })
  defaultSsv: number;

  @Column({ type: 'enum', enum: RecordStatus, enumName: 'record_status' })
  status: RecordStatus;
}
