import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from '../../common/enums/database.enums';
import {
  Notification,
  NotificationCatalog,
  NotificationDeliverie,
} from './entities';

@Injectable()
export class NotificationsService {
  static readonly ACCOUNT_LOCKED_EVENT_CODE = 'user.account_locked';
  static readonly ACCOUNT_TEMPORARILY_LOCKED_EVENT_CODE =
    'user.account_temporarily_locked';

  constructor(
    @InjectRepository(NotificationDeliverie)
    private readonly deliveries: Repository<NotificationDeliverie>,
  ) {}

  async createAccountLockedEmailDelivery(
    manager: EntityManager,
    input: { userId: string; reason: string },
  ): Promise<{ deliveryId: string }> {
    const catalogRepository = manager.getRepository(NotificationCatalog);
    await catalogRepository.upsert(
      {
        eventCode: NotificationsService.ACCOUNT_LOCKED_EVENT_CODE,
        eventGroup: 'security',
        displayName: 'Tài khoản bị khóa',
        defaultInApp: false,
        defaultEmail: true,
        isActive: true,
      },
      ['eventCode'],
    );
    const catalog = await catalogRepository.findOneByOrFail({
      eventCode: NotificationsService.ACCOUNT_LOCKED_EVENT_CODE,
    });
    const notificationRepository = manager.getRepository(Notification);
    const notification = await notificationRepository.save(
      notificationRepository.create({
        recipientUserId: input.userId,
        notificationCatalogId: catalog.id,
        title: 'Tài khoản TAMI ERP đã bị khóa',
        body: `Lý do: ${input.reason}`,
        entityType: 'user',
        entityId: input.userId,
      }),
    );
    const deliveryRepository = manager.getRepository(NotificationDeliverie);
    const delivery = await deliveryRepository.save(
      deliveryRepository.create({
        notificationId: notification.id,
        channel: NotificationChannel.EMAIL,
        status: NotificationDeliveryStatus.PENDING,
        attemptCount: 0,
        lastError: null,
        nextAttemptAt: null,
        sentAt: null,
      }),
    );
    return { deliveryId: delivery.id };
  }

  async createTemporaryAccountLockEmailDelivery(
    manager: EntityManager,
    input: { userId: string; lockedAt: Date; lockoutUntil: Date },
  ): Promise<{ deliveryId: string }> {
    const catalogRepository = manager.getRepository(NotificationCatalog);
    await catalogRepository.upsert(
      {
        eventCode: NotificationsService.ACCOUNT_TEMPORARILY_LOCKED_EVENT_CODE,
        eventGroup: 'security',
        displayName: 'Tài khoản bị khóa tạm thời',
        defaultInApp: false,
        defaultEmail: true,
        isActive: true,
      },
      ['eventCode'],
    );
    const catalog = await catalogRepository.findOneByOrFail({
      eventCode: NotificationsService.ACCOUNT_TEMPORARILY_LOCKED_EVENT_CODE,
    });
    const notificationRepository = manager.getRepository(Notification);
    const notification = await notificationRepository.save(
      notificationRepository.create({
        recipientUserId: input.userId,
        notificationCatalogId: catalog.id,
        title: 'Tài khoản TAMI ERP bị khóa tạm thời',
        body: `Khóa từ ${input.lockedAt.toISOString()} đến ${input.lockoutUntil.toISOString()}`,
        entityType: 'user',
        entityId: input.userId,
      }),
    );
    const deliveryRepository = manager.getRepository(NotificationDeliverie);
    const delivery = await deliveryRepository.save(
      deliveryRepository.create({
        notificationId: notification.id,
        channel: NotificationChannel.EMAIL,
        status: NotificationDeliveryStatus.PENDING,
        attemptCount: 0,
        lastError: null,
        nextAttemptAt: null,
        sentAt: null,
      }),
    );
    return { deliveryId: delivery.id };
  }

  async recordEmailDeliverySent(deliveryId: string): Promise<void> {
    await this.deliveries.update(
      { id: deliveryId },
      {
        status: NotificationDeliveryStatus.SENT,
        attemptCount: () => '"attempt_count" + 1',
        lastError: null,
        nextAttemptAt: null,
        sentAt: new Date(),
      },
    );
  }

  async recordEmailDeliveryFailed(
    deliveryId: string,
    error: unknown,
  ): Promise<void> {
    await this.deliveries.update(
      { id: deliveryId },
      {
        status: NotificationDeliveryStatus.FAILED,
        attemptCount: () => '"attempt_count" + 1',
        lastError: this.sanitizeDeliveryError(error),
        nextAttemptAt: null,
        sentAt: null,
      },
    );
  }

  private sanitizeDeliveryError(error: unknown): string {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string' &&
      /^[A-Z0-9_-]{1,64}$/.test(error.code)
        ? error.code
        : null;
    return code ? `SMTP delivery failed (${code})` : 'SMTP delivery failed';
  }
}
