import { Entity, Column, PrimaryColumn } from 'typeorm';
import { DocumentPurpose } from '../../../common/enums/database.enums';

@Entity('purchase_order_documents')
export class PurchaseOrderDocument {
  @PrimaryColumn({ type: 'uuid' })
  purchaseOrderId: string;

  @PrimaryColumn({ type: 'uuid' })
  documentId: string;

  @Column({ type: 'enum', enum: DocumentPurpose, enumName: 'document_purpose' })
  purpose: DocumentPurpose;

  @Column({ type: 'uuid', nullable: true, name: 'linked_by' })
  linkedBy: string;

  @Column({ type: 'timestamptz', name: 'linked_at' })
  linkedAt: Date;
}
