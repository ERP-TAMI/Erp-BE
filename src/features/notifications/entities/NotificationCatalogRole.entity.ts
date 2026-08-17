import { Entity, PrimaryColumn } from 'typeorm';

@Entity('notification_catalog_roles')
export class NotificationCatalogRole {
  @PrimaryColumn({ type: 'uuid' })
  notificationCatalogId: string;

  @PrimaryColumn({ type: 'uuid' })
  roleId: string;
}
