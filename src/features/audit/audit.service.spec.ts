import { EntityManager, Repository } from 'typeorm';
import { AuditEvent, AuditEventChange, HttpAuditLog } from './entities';
import { AuditService } from './audit.service';
import { AuditEventType } from '../../common/enums/database.enums';

function buildHttpAuditLogRepository(): jest.Mocked<Repository<HttpAuditLog>> {
  return {
    create: jest.fn((value) => value),
    save: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(),
  } as unknown as jest.Mocked<Repository<HttpAuditLog>>;
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

    await new AuditService(buildHttpAuditLogRepository()).recordUserChange(
      manager,
      {
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
      },
    );

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
    const httpAuditLogs = buildHttpAuditLogRepository();

    await new AuditService(httpAuditLogs).recordHttpRequest({
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
});
