import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('folder_documents')
export class FolderDocument {
  @PrimaryColumn({ type: 'uuid' })
  folderId: string;

  @PrimaryColumn({ type: 'uuid' })
  documentId: string;

  @Column({ type: 'timestamptz', name: 'linked_at' })
  linkedAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'linked_by' })
  linkedBy: string;
}
