import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductionDocStatus } from '../../../common/enums/database.enums';

@Entity('production_documents')
export class ProductionDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true, name: 'style_id' })
  styleId: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'product_id' })
  productId: string | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: ProductionDocStatus,
    enumName: 'production_doc_status',
    default: ProductionDocStatus.DRAFT,
  })
  status: ProductionDocStatus;

  @Column({ type: 'uuid', nullable: true, name: 'source_document_id' })
  sourceDocumentId: string | null;

  @Column({ type: 'bigint', default: 1, name: 'row_version' })
  rowVersion: number;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'updated_by' })
  updatedBy: string | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
