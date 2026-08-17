import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('product_color_card_versions')
export class ProductColorCardVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'color_card_id' })
  colorCardId: string;

  @Column({ type: 'int', name: 'version_no' })
  versionNo: number;

  @Column({ type: 'uuid', name: 'document_version_id' })
  documentVersionId: string;

  @Column({ type: 'text', nullable: true, name: 'replacement_reason' })
  replacementReason: string;

  @Column({ type: 'uuid', nullable: true, name: 'uploaded_by' })
  uploadedBy: string;

  @Column({ type: 'timestamptz', name: 'uploaded_at' })
  uploadedAt: Date;
}
