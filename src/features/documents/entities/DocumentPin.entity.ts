import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('document_pins')
export class DocumentPin {
  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId: string;

  @PrimaryColumn({ type: 'uuid', name: 'document_id' })
  documentId: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'pinned_at' })
  pinnedAt: Date;
}
