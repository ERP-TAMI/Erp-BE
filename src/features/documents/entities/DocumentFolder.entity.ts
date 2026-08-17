import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('document_folders')
export class DocumentFolder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true, name: 'parent_id' })
  parentId: string;

  @Column({ type: 'varchar', length: 255, name: 'folder_name' })
  folderName: string;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
