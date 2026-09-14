import { EntityManager, Repository } from 'typeorm';
import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from '../../common/enums/database.enums';
import { NotificationsService } from './notifications.service';
import {
  Notification,
  NotificationCatalog,
  NotificationDeliverie,
} from './entities';

describe('NotificationsService account lock email delivery', () => {
  let deliveries: jest.Mocked<Repository<NotificationDeliverie>>;
  let catalog: jest.Mocked<Repository<NotificationCatalog>>;
  let notifications: jest.Mocked<Repository<Notification>>;
  let manager: EntityManager;
  let service: NotificationsService;

  beforeEach(() => {
    deliveries = {
      create: jest.fn((value) => value as NotificationDeliverie),
      save: jest.fn(async (value) => ({ id: 'delivery-id', ...value })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<Repository<NotificationDeliverie>>;
    catalog = {
      upsert: jest.fn().mockResolvedValue({ identifiers: [] }),
      findOneByOrFail: jest.fn().mockResolvedValue({ id: 'catalog-id' }),
    } as unknown as jest.Mocked<Repository<NotificationCatalog>>;
    notifications = {
      create: jest.fn((value) => value as Notification),
      save: jest.fn(async (value) => ({ id: 'notification-id', ...value })),
    } as unknown as jest.Mocked<Repository<Notification>>;
    manager = {
      getRepository: jest.fn((entity) => {
        if (entity === NotificationCatalog) return catalog;
        if (entity === Notification) return notifications;
        return deliveries;
      }),
    } as unknown as EntityManager;
    service = new NotificationsService(deliveries);
  });

  it('creates a pending email delivery in the caller transaction', async () => {
    await expect(
      service.createAccountLockedEmailDelivery(manager, {
        userId: '22222222-2222-4222-8222-222222222222',
        reason: 'Vi phạm chính sách',
      }),
    ).resolves.toEqual({ deliveryId: 'delivery-id' });

    expect(catalog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ eventCode: 'user.account_locked' }),
      ['eventCode'],
    );
    expect(deliveries.create).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: 'notification-id',
        channel: NotificationChannel.EMAIL,
        status: NotificationDeliveryStatus.PENDING,
        attemptCount: 0,
      }),
    );
  });

  it('records sent delivery state', async () => {
    await service.recordEmailDeliverySent('delivery-id');

    expect(deliveries.update).toHaveBeenCalledWith(
      { id: 'delivery-id' },
      expect.objectContaining({
        status: NotificationDeliveryStatus.SENT,
        sentAt: expect.any(Date),
      }),
    );
  });

  it('records a sanitized failure without persisting SMTP credentials', async () => {
    const error = Object.assign(
      new Error('Authentication failed for password super-secret'),
      { code: 'EAUTH' },
    );

    await service.recordEmailDeliveryFailed('delivery-id', error);

    const update = deliveries.update.mock.calls[0][1];
    expect(update).toEqual(
      expect.objectContaining({
        status: NotificationDeliveryStatus.FAILED,
        lastError: 'SMTP delivery failed (EAUTH)',
      }),
    );
    expect(JSON.stringify(update)).not.toContain('super-secret');
  });
});
