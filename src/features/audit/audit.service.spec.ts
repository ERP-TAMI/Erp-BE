import { EntityManager, Repository } from 'typeorm';
import { AuditEvent, AuditEventChange, HttpAuditLog } from './entities';
import { AuditService } from './audit.service';
import { AuditEventType } from '../../common/enums/database.enums';
import { User } from '../auth/entities/User.entity';

function buildHttpAuditLogRepository(): jest.Mocked<Repository<HttpAuditLog>> {
  return {
    create: jest.fn((value) => value),
    save: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(),
  } as unknown as jest.Mocked<Repository<HttpAuditLog>>;
}

function buildAuditService() {
  const httpAuditLogs = buildHttpAuditLogRepository();
  const auditEvents = {
    find: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<Repository<AuditEvent>>;
  const auditEventChanges = {
    find: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<Repository<AuditEventChange>>;
  const users = {
    find: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<Repository<User>>;
  const service = new AuditService(
    httpAuditLogs,
    auditEvents,
    auditEventChanges,
    users,
  );
  return { service, httpAuditLogs, auditEvents, auditEventChanges, users };
}

describe('AuditService', () => {
  it('records a user status transition with actor, target and reason', async () => {
    const eventRepository = {
      create: jest.fn((value) => ({ id: 'audit-id', ...value })),
      save: jest.fn(async (value) => value),
    } as unknown as jest.Mocked<Repository<AuditEvent>>;
    const changeRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    } as unknown as jest.Mocked<Repository<AuditEventChange>>;
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === AuditEvent ? eventRepository : changeRepository,
      ),
    } as unknown as EntityManager;

    const { service } = buildAuditService();
    await service.recordUserChange(manager, {
      actorId: 'actor-id',
      actorRole: 'IT',
      targetId: 'target-id',
      targetLabel: 'target@example.com',
      eventType: AuditEventType.STATUS_CHANGED,
      reason: 'Vi phạm chính sách',
      changes: [
        {
          fieldName: 'accountStatus',
          oldValue: 'active',
          newValue: 'locked',
        },
      ],
    });

    expect(eventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'actor-id',
        actorRole: 'IT',
        aggregateType: 'User',
        aggregateId: 'target-id',
        targetLabel: 'target@example.com',
        reason: 'Vi phạm chính sách',
        eventType: AuditEventType.STATUS_CHANGED,
      }),
    );
    expect(changeRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        auditEventId: 'audit-id',
        fieldName: 'accountStatus',
        oldValue: 'active',
        newValue: 'locked',
      }),
    );
  });

  it('persists a generic http request log entry', async () => {
    const { service, httpAuditLogs } = buildAuditService();

    await service.recordHttpRequest({
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      method: 'GET',
      path: '/styles',
      statusCode: 200,
      durationMs: 12,
      actorUserId: 'user-1',
      actorIdentifier: null,
      actorRole: 'SA',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      requestId: 'req-1',
      queryParams: { page: 1 },
      requestBody: null,
      errorMessage: null,
    });

    expect(httpAuditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/styles',
        statusCode: 200,
        actorUserId: 'user-1',
      }),
    );
    expect(httpAuditLogs.save).toHaveBeenCalled();
  });

  describe('recordEntityChange', () => {
    function buildManager() {
      const eventRepository = {
        create: jest.fn((value) => ({ id: 'audit-id', ...value })),
        save: jest.fn(async (value) => value),
      } as unknown as jest.Mocked<Repository<AuditEvent>>;
      const changeRepository = {
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => value),
      } as unknown as jest.Mocked<Repository<AuditEventChange>>;
      const manager = {
        getRepository: jest.fn((entity) =>
          entity === AuditEvent ? eventRepository : changeRepository,
        ),
      } as unknown as EntityManager;
      return { manager, eventRepository, changeRepository };
    }

    it('skips writing when there are no changes and the event is not a creation', async () => {
      const { service } = buildAuditService();
      const { manager, eventRepository } = buildManager();

      await service.recordEntityChange(manager, {
        aggregateType: 'StyleOperationStep',
        aggregateId: 'step-1',
        actorId: 'actor-1',
        actorRole: 'RD',
        eventType: AuditEventType.UPDATED,
        changes: [],
      });

      expect(eventRepository.create).not.toHaveBeenCalled();
    });

    it('auto-generates a Vietnamese reason from changed field labels when none is given', async () => {
      const { service } = buildAuditService();
      const { manager, eventRepository, changeRepository } = buildManager();

      await service.recordEntityChange(manager, {
        aggregateType: 'StyleOperationStep',
        aggregateId: 'step-1',
        parentId: 'style-1',
        actorId: 'actor-1',
        actorRole: 'RD',
        targetLabel: 'Cắt',
        eventType: AuditEventType.UPDATED,
        changes: [
          { fieldName: 'stepName', oldValue: 'Cắt', newValue: 'Cắt vải' },
        ],
      });

      expect(eventRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregateType: 'StyleOperationStep',
          aggregateId: 'step-1',
          parentId: 'style-1',
          reason: 'Cập nhật: Tên công đoạn',
        }),
      );
      expect(changeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldName: 'stepName',
          oldValue: 'Cắt',
          newValue: 'Cắt vải',
        }),
      );
    });

    it('records a creation event even with an empty diff', async () => {
      const { service } = buildAuditService();
      const { manager, eventRepository } = buildManager();

      await service.recordEntityChange(manager, {
        aggregateType: 'StyleOperationStep',
        aggregateId: 'step-2',
        actorId: 'actor-1',
        actorRole: 'RD',
        eventType: AuditEventType.CREATED,
        changes: [],
      });

      expect(eventRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: AuditEventType.CREATED }),
      );
    });
  });

  describe('findEntityHistory', () => {
    it('joins events with their field changes and resolves a human-readable label', async () => {
      const { service, auditEvents, auditEventChanges } = buildAuditService();
      (auditEvents.find as jest.Mock).mockResolvedValue([
        {
          id: 'event-1',
          occurredAt: new Date('2026-01-01T00:00:00.000Z'),
          eventType: AuditEventType.UPDATED,
          actorUserId: 'actor-1',
          actorRole: 'RD',
          targetLabel: 'Cắt',
          reason: 'Cập nhật: Tên công đoạn',
        },
      ]);
      (auditEventChanges.find as jest.Mock).mockResolvedValue([
        {
          auditEventId: 'event-1',
          fieldName: 'stepName',
          oldValue: 'Cắt',
          newValue: 'Cắt vải',
        },
      ]);

      const result = await service.findEntityHistory(
        'StyleOperationStep',
        'step-1',
        [],
      );

      expect(result).toHaveLength(1);
      expect(result[0].changes[0]).toMatchObject({
        fieldName: 'stepName',
        fieldLabel: 'Tên công đoạn',
        oldValue: 'Cắt',
        newValue: 'Cắt vải',
      });
    });

    it('returns an empty list when there are no events', async () => {
      const { service } = buildAuditService();
      const result = await service.findEntityHistory(
        'StyleOperationStep',
        'step-1',
        [],
      );
      expect(result).toEqual([]);
    });
  });
});
