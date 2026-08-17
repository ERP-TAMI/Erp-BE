import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { SampleStatus } from '../../../common/enums/database.enums';

@Entity('purchase_order_product_sample_rounds')
export class PurchaseOrderProductSampleRound {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'product_id' })
  productId: string;

  @Column({
    type: 'uuid',
    nullable: true,
    name: 'source_style_sample_round_id',
  })
  sourceStyleSampleRoundId: string;

  @Column({ type: 'int', name: 'round_no' })
  roundNo: number;

  @Column({ type: 'date', nullable: true, name: 'sample_date' })
  sampleDate: Date;

  @Column({ type: 'text', nullable: true })
  feedback: string;

  @Column({ type: 'enum', enum: SampleStatus, enumName: 'sample_status' })
  status: SampleStatus;

  @Column({ type: 'bigint', default: 1, name: 'row_version' })
  rowVersion: number;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'reviewed_by' })
  reviewedBy: string;

  @Column({ type: 'timestamptz', nullable: true, name: 'reviewed_at' })
  reviewedAt: Date;
}
