import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('notification_catalog')
export class NotificationCatalog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, name: 'event_code' })
  eventCode: string;

  @Column({ type: 'varchar', length: 50, name: 'event_group' })
  eventGroup: string;

  @Column({ type: 'varchar', length: 255, name: 'display_name' })
  displayName: string;

  @Column({ type: 'boolean', default: true, name: 'default_in_app' })
  defaultInApp: boolean;

  @Column({ type: 'boolean', default: false, name: 'default_email' })
  defaultEmail: boolean;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;
}
