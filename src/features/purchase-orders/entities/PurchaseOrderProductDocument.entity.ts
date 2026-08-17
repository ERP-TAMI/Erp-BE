import { Entity, Column, PrimaryColumn } from 'typeorm';
import { DocumentPurpose } from '../../../common/enums/database.enums';

@Entity('purchase_order_product_documents')
export class PurchaseOrderProductDocument {
  @PrimaryColumn({ type: 'uuid' })
  productId: string;

  @PrimaryColumn({ type: 'uuid' })
  documentId: string;

  @Column({ type: 'boolean', default: false, name: 'source_po_document' })
  sourcePoDocument: boolean;

  @Column({ type: 'enum', enum: DocumentPurpose, enumName: 'document_purpose' })
  purpose: DocumentPurpose;

  @Column({ type: 'uuid', nullable: true, name: 'linked_by' })
  linkedBy: string;

  @Column({ type: 'timestamptz', name: 'linked_at' })
  linkedAt: Date;
}
