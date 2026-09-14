import { EntityManager, Repository } from 'typeorm';
import { AuditEvent, AuditEventChange } from './entities';
import { AuditService } from './audit.service';
import { AuditEventType } from '../../common/enums/database.enums';

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

    await new AuditService().recordUserChange(manager, {
      actorId: 'actor-id',
      actorRole: 'IT',
      targetId: 'target-id',
      targetLabel: 'target@example.com',
      eventType: AuditEventType.STATUS_CHANGED,
      reason: 'Vi phạm chính sách',
      changes: [
        { fieldName: 'accountStatus', oldValue: 'active', newValue: 'locked' },
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
});
