import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('production_document_revisions')
export class ProductionDocumentRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'production_document_id' })
  productionDocumentId: string;

  @Column({ type: 'int', name: 'revision_no' })
  revisionNo: number;

  @Column({ type: 'varchar', length: 30 })
  action: string;

  @Column({ type: 'uuid', nullable: true, name: 'source_document_id' })
  sourceDocumentId: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
