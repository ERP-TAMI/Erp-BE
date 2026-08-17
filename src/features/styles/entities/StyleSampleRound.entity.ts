import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { SampleStatus } from '../../../common/enums/database.enums';

@Entity('style_sample_rounds')
export class StyleSampleRound {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'style_id' })
  styleId: string;

  @Column({ type: 'int', name: 'round_no' })
  roundNo: number;

  @Column({ type: 'date', nullable: true, name: 'sample_date' })
  sampleDate: Date;

  @Column({ type: 'text', nullable: true })
  feedback: string;

  @Column({ type: 'enum', enum: SampleStatus, enumName: 'sample_status' })
  status: SampleStatus;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'reviewed_by' })
  reviewedBy: string;

  @Column({ type: 'timestamptz', nullable: true, name: 'reviewed_at' })
  reviewedAt: Date;
}
