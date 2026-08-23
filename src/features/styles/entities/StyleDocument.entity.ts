import { Entity, Column, PrimaryColumn } from 'typeorm';
import { DocumentPurpose } from '../../../common/enums/database.enums';

@Entity('style_documents')
export class StyleDocument {
  @PrimaryColumn({ type: 'uuid', name: 'style_id' })
  styleId: string;

  @PrimaryColumn({ type: 'uuid', name: 'document_id' })
  documentId: string;

  @Column({
    type: 'enum',
    enum: DocumentPurpose,
    enumName: 'document_purpose',
    default: DocumentPurpose.OTHER,
  })
  purpose: DocumentPurpose;

  @Column({ type: 'uuid', nullable: true, name: 'linked_by' })
  linkedBy: string | null;

  @Column({ type: 'timestamptz', name: 'linked_at' })
  linkedAt: Date;
}
