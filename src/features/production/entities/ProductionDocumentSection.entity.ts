import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('production_document_sections')
export class ProductionDocumentSection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'production_document_id' })
  productionDocumentId: string;

  @Column({ type: 'varchar', length: 40, name: 'section_code' })
  sectionCode: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex: number;

  @Column({ type: 'boolean', default: false, name: 'is_fixed' })
  isFixed: boolean;

  // Despite the field name, each entry is an S3 object key, never a URL — a
  // presigned URL expires (PRESIGN_GET_EXPIRY_SECONDS), so it must be
  // resolved fresh on every read instead of being persisted here.
  @Column({ type: 'jsonb', nullable: true, name: 'image_groups' })
  imageGroups:
    | {
        kind?: 'text' | 'image';
        heading: string | null;
        content?: string | null;
        headingColor: 'red' | 'black';
        imageUrls: string[];
        orderIndex?: number;
      }[]
    | null;
}
