import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('folder_documents')
export class FolderDocument {
  @PrimaryColumn({ type: 'uuid', name: 'folder_id' })
  folderId: string;

  @PrimaryColumn({ type: 'uuid', name: 'document_id' })
  documentId: string;

  @Column({ type: 'timestamptz', name: 'linked_at' })
  linkedAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'linked_by' })
  linkedBy: string;
}
