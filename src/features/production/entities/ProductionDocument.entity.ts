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

  // Section 1: Mô tả hình dáng
  @Column({ type: 'text', nullable: true, name: 'section1_description' })
  section1Description: string | null;

  @Column({ type: 'text', nullable: true, name: 'section1_image_url' })
  section1ImageUrl: string | null;

  // Section 2: Phụ liệu
  @Column({ type: 'text', nullable: true, name: 'section2_accessories' })
  section2Accessories: string | null;

  // Section 3: Lưu ý trải cắt
  @Column({ type: 'text', nullable: true, name: 'section3_notes' })
  section3Notes: string | null;

  // Section 4: Comment khách hàng
  @Column({ type: 'text', nullable: true, name: 'section4_customer_feedback' })
  section4CustomerFeedback: string | null;

  // Size data (JSON)
  @Column({ type: 'jsonb', nullable: true, name: 'size_data' })
  sizeData: any;

  @Column({ type: 'uuid', nullable: true, name: 'copied_from_style_id' })
  copiedFromStyleId: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'copied_at' })
  copiedAt: Date | null;

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
