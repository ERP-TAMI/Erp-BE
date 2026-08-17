import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { UploadStatus } from '../../../common/enums/database.enums';

@Entity('document_versions')
export class DocumentVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'document_id' })
  documentId: string;

  @Column({ type: 'int', name: 'version_no' })
  versionNo: number;

  @Column({ type: 'varchar', length: 500, name: 'original_file_name' })
  originalFileName: string;

  @Column({ type: 'varchar', length: 1000, name: 'storage_key' })
  storageKey: string;

  @Column({ type: 'varchar', length: 255, name: 'mime_type' })
  mimeType: string;

  @Column({ type: 'bigint', name: 'byte_size' })
  byteSize: number;

  @Column({ type: 'char', length: 64, nullable: true })
  sha256: string;

  @Column({ type: 'enum', enum: UploadStatus, enumName: 'upload_status' })
  status: UploadStatus;

  @Column({ type: 'text', nullable: true, name: 'change_reason' })
  changeReason: string;

  @Column({ type: 'uuid', nullable: true, name: 'uploaded_by' })
  uploadedBy: string;

  @Column({ type: 'timestamptz', name: 'uploaded_at' })
  uploadedAt: Date;
}
