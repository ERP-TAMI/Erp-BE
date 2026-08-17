import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'recipient_user_id' })
  recipientUserId: string;

  @Column({ type: 'uuid', name: 'notification_catalog_id' })
  notificationCatalogId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 80, nullable: true, name: 'entity_type' })
  entityType: string;

  @Column({ type: 'uuid', nullable: true, name: 'entity_id' })
  entityId: string;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'read_at' })
  readAt: Date;
}
