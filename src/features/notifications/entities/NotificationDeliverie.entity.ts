import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from '../../../common/enums/database.enums';

@Entity('notification_deliveries')
export class NotificationDeliverie {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'notification_id' })
  notificationId: string;

  @Column({
    type: 'enum',
    enum: NotificationChannel,
    enumName: 'notification_channel',
  })
  channel: NotificationChannel;

  @Column({
    type: 'enum',
    enum: NotificationDeliveryStatus,
    enumName: 'notification_delivery_status',
  })
  status: NotificationDeliveryStatus;

  @Column({ type: 'int', default: 0, name: 'attempt_count' })
  attemptCount: number;

  @Column({ type: 'text', nullable: true, name: 'last_error' })
  lastError: string;

  @Column({ type: 'timestamptz', nullable: true, name: 'next_attempt_at' })
  nextAttemptAt: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'sent_at' })
  sentAt: Date;

  @Column({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
