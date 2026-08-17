import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('notification_preferences')
export class NotificationPreference {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @PrimaryColumn({ type: 'uuid' })
  notificationCatalogId: string;

  @Column({ type: 'boolean', name: 'in_app_enabled' })
  inAppEnabled: boolean;

  @Column({ type: 'boolean', name: 'email_enabled' })
  emailEnabled: boolean;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
