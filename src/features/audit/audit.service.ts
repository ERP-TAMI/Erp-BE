import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditEventType } from '../../common/enums/database.enums';
import { AuditEvent, AuditEventChange } from './entities';

type AuditChangeInput = {
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
};

type UserAuditInput = {
  actorId: string;
  actorRole: string;
  targetId: string;
  targetLabel: string;
  eventType: AuditEventType;
  reason?: string;
  changes: AuditChangeInput[];
};

@Injectable()
export class AuditService {
  async recordUserChange(
    manager: EntityManager,
    input: UserAuditInput,
  ): Promise<void> {
    const eventRepository = manager.getRepository(AuditEvent);
    const event = await eventRepository.save(
      eventRepository.create({
        occurredAt: new Date(),
        actorUserId: input.actorId,
        aggregateType: 'User',
        aggregateId: input.targetId,
        eventType: input.eventType,
        actorRole: input.actorRole,
        targetLabel: input.targetLabel,
        reason: input.reason,
      }),
    );

    if (input.changes.length === 0) return;
    const changeRepository = manager.getRepository(AuditEventChange);
    await changeRepository.save(
      input.changes.map((change) =>
        changeRepository.create({
          auditEventId: event.id,
          fieldName: change.fieldName,
          oldValue: change.oldValue as string,
          newValue: change.newValue as string,
        }),
      ),
    );
  }
}
