import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'document_code',
  })
  documentCode: string | null;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'uuid', nullable: true, name: 'current_version_id' })
  currentVersionId: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'created_by' })
  createdBy: string | null;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'archived_at' })
  archivedAt: Date | null;
}
