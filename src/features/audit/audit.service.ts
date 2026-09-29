import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditEventType } from '../../common/enums/database.enums';
import { AuditEvent, AuditEventChange, HttpAuditLog } from './entities';
import { QueryHttpAuditLogsDto } from './dto/query-http-audit-logs.dto';

export type PaginatedHttpAuditLogs = {
  items: HttpAuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

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

export type HttpAuditInput = {
  occurredAt: Date;
  method: string;
  path: string;
  statusCode: number | null;
  durationMs: number | null;
  actorUserId: string | null;
  actorIdentifier: string | null;
  actorRole: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  queryParams: Record<string, unknown> | null;
  requestBody: Record<string, unknown> | null;
  errorMessage: string | null;
};

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(HttpAuditLog)
    private readonly httpAuditLogs: Repository<HttpAuditLog>,
  ) {}

  async recordHttpRequest(input: HttpAuditInput): Promise<void> {
    await this.httpAuditLogs.save(this.httpAuditLogs.create(input));
  }

  async findHttpAuditLogs(
    query: QueryHttpAuditLogsDto,
  ): Promise<PaginatedHttpAuditLogs> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(100, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.httpAuditLogs.createQueryBuilder('log');
    if (query.method) {
      qb.andWhere('log.method = :method', {
        method: query.method.toUpperCase(),
      });
    }
    if (query.path) {
      qb.andWhere('log.path ILIKE :path', { path: `%${query.path}%` });
    }
    if (query.actorUserId) {
      qb.andWhere('log.actorUserId = :actorUserId', {
        actorUserId: query.actorUserId,
      });
    }
    if (query.from) {
      qb.andWhere('log.occurredAt >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('log.occurredAt <= :to', { to: new Date(query.to) });
    }
    qb.orderBy('log.occurredAt', 'DESC').addOrderBy('log.id', 'DESC');
    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

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
