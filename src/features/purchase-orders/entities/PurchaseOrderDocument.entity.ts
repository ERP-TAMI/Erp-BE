import { Entity, Column, PrimaryColumn } from 'typeorm';
import { DocumentPurpose } from '../../../common/enums/database.enums';

@Entity('purchase_order_documents')
export class PurchaseOrderDocument {
  @PrimaryColumn({ type: 'uuid', name: 'purchase_order_id' })
  purchaseOrderId: string;

  @PrimaryColumn({ type: 'uuid', name: 'document_id' })
  documentId: string;

  @Column({ type: 'enum', enum: DocumentPurpose, enumName: 'document_purpose' })
  purpose: DocumentPurpose;

  @Column({ type: 'uuid', nullable: true, name: 'linked_by' })
  linkedBy: string | null;

  @Column({ type: 'timestamptz', name: 'linked_at' })
  linkedAt: Date;
}
