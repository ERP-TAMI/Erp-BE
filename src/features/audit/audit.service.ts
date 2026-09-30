import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { AuditEventType } from '../../common/enums/database.enums';
import { AuditEvent, AuditEventChange, HttpAuditLog } from './entities';
import { QueryHttpAuditLogsDto } from './dto/query-http-audit-logs.dto';
import { QueryEntityHistoryDto } from './dto/query-entity-history.dto';
import { EntityFieldChange } from './entity-diff.util';
import {
  canViewSensitiveFields,
  getFieldLabel,
  getFieldValueLabel,
  isSensitiveField,
  splitBulkFieldName,
} from './entity-audit.config';
import { User } from '../auth/entities/User.entity';

const SENSITIVE_MASK = '***';

/** Chỉ dịch khi giá trị là string (enum/mã nội bộ) — number/boolean/object
 * (VD sizeData, isGroup) giữ nguyên, FE tự format theo kiểu dữ liệu. */
function translateFieldValue(
  aggregateType: string,
  fieldName: string,
  value: unknown,
): unknown {
  if (typeof value !== 'string') return value;
  return getFieldValueLabel(aggregateType, fieldName, value);
}

const REASON_REQUIRED_EVENT_TYPES = new Set<AuditEventType>([
  AuditEventType.UPDATED,
  AuditEventType.DELETED,
  AuditEventType.STATUS_CHANGED,
  AuditEventType.APPROVED,
  AuditEventType.REJECTED,
  AuditEventType.ROLE_CHANGED,
]);

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

export type EntityAuditInput = {
  aggregateType: string;
  aggregateId: string;
  parentId?: string;
  actorId: string;
  actorRole: string;
  targetLabel?: string;
  eventType: AuditEventType;
  reason?: string;
  changes: EntityFieldChange[];
};

export type EntityHistoryChange = {
  fieldName: string;
  fieldLabel: string;
  /** Chỉ có ở các entry đến từ 1 lần lưu hàng loạt — tên dòng (VD "Cắt vải")
   * mà field này thuộc về, để FE nhóm hiển thị theo dòng thay vì 1 danh sách
   * phẳng lặp lại tên dòng ở mỗi field. */
  groupLabel?: string;
  oldValue: unknown;
  newValue: unknown;
};

export type EntityHistoryEvent = {
  id: string;
  occurredAt: Date;
  eventType: AuditEventType;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: string | null;
  targetLabel: string | null;
  reason: string | null;
  changes: EntityHistoryChange[];
};

export type PaginatedEntityHistory = {
  items: EntityHistoryEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(HttpAuditLog)
    private readonly httpAuditLogs: Repository<HttpAuditLog>,
    @InjectRepository(AuditEvent)
    private readonly auditEvents: Repository<AuditEvent>,
    @InjectRepository(AuditEventChange)
    private readonly auditEventChanges: Repository<AuditEventChange>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
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

  /**
   * Generic per-record changelog, used by any module's create/update/delete
   * flow. Skips writing entirely for a no-op update (empty diff) so unrelated
   * saves (e.g. re-submitting a bulk grid with nothing actually changed)
   * don't spam the timeline.
   */
  async recordEntityChange(
    manager: EntityManager,
    input: EntityAuditInput,
  ): Promise<void> {
    // Chỉ bỏ qua khi UPDATED thực sự rỗng (save lại mà không đổi gì). Các
    // eventType khác (CREATED, DELETED, STATUS_CHANGED, ...) vẫn có ý nghĩa
    // dù không có field-diff — ví dụ DELETED không cần diff, bản thân sự
    // kiện "đã xoá" đã là thông tin cần ghi.
    if (
      input.changes.length === 0 &&
      input.eventType === AuditEventType.UPDATED
    ) {
      return;
    }

    const reason: string | undefined = REASON_REQUIRED_EVENT_TYPES.has(
      input.eventType,
    )
      ? (input.reason ??
        this.buildDefaultReason(
          input.aggregateType,
          input.eventType,
          input.changes,
        ))
      : input.reason;

    const eventRepository = manager.getRepository(AuditEvent);
    const event = await eventRepository.save(
      eventRepository.create({
        occurredAt: new Date(),
        actorUserId: input.actorId,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        parentId: input.parentId,
        eventType: input.eventType,
        actorRole: input.actorRole,
        targetLabel: input.targetLabel,
        reason,
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

  async findEntityHistory(
    query: QueryEntityHistoryDto,
    requesterPermissions: string[],
  ): Promise<PaginatedEntityHistory> {
    if (!query.aggregateId && !query.parentId) {
      throw new BadRequestException(
        'Cần truyền aggregateId (1 bản ghi) hoặc parentId (mọi bản ghi con của 1 cha).',
      );
    }

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(100, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.auditEvents
      .createQueryBuilder('event')
      .where('event.aggregateType = :aggregateType', {
        aggregateType: query.aggregateType,
      });
    if (query.aggregateId) {
      qb.andWhere('event.aggregateId = :aggregateId', {
        aggregateId: query.aggregateId,
      });
    }
    if (query.parentId) {
      qb.andWhere('event.parentId = :parentId', { parentId: query.parentId });
    }
    if (query.search) {
      qb.andWhere('event.targetLabel ILIKE :search', {
        search: `%${query.search}%`,
      });
    }
    if (query.from) {
      qb.andWhere('event.occurredAt >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('event.occurredAt <= :to', { to: new Date(query.to) });
    }
    qb.orderBy('event.occurredAt', 'DESC').addOrderBy('event.id', 'DESC');
    qb.skip(skip).take(limit);

    const [events, total] = await qb.getManyAndCount();
    if (events.length === 0) {
      return {
        items: [],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      };
    }

    const changes = await this.auditEventChanges.find({
      where: { auditEventId: In(events.map((event) => event.id)) },
    });
    const changesByEvent = new Map<string, AuditEventChange[]>();
    for (const change of changes) {
      const list = changesByEvent.get(change.auditEventId) ?? [];
      list.push(change);
      changesByEvent.set(change.auditEventId, list);
    }

    const canViewSensitive = canViewSensitiveFields(
      query.aggregateType,
      requesterPermissions,
    );

    const actorIds = [
      ...new Set(
        events
          .map((event) => event.actorUserId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const actors =
      actorIds.length === 0
        ? []
        : await this.users.find({
            where: { id: In(actorIds) },
            select: ['id', 'fullName', 'email'],
          });
    const actorNameById = new Map(
      actors.map((actor) => [actor.id, actor.fullName || actor.email]),
    );

    const items = events.map((event) => ({
      id: event.id,
      occurredAt: event.occurredAt,
      eventType: event.eventType,
      actorUserId: event.actorUserId,
      actorName: event.actorUserId
        ? (actorNameById.get(event.actorUserId) ?? null)
        : null,
      actorRole: event.actorRole,
      targetLabel: event.targetLabel,
      reason: event.reason,
      changes: (changesByEvent.get(event.id) ?? []).map((change) => {
        const bulk = splitBulkFieldName(change.fieldName);
        const realFieldName = bulk ? bulk.realFieldName : change.fieldName;
        const sensitive = isSensitiveField(query.aggregateType, realFieldName);
        const masked = sensitive && !canViewSensitive;
        return {
          fieldName: change.fieldName,
          fieldLabel: getFieldLabel(query.aggregateType, realFieldName),
          groupLabel: bulk?.rowLabel,
          oldValue: masked
            ? SENSITIVE_MASK
            : translateFieldValue(
                query.aggregateType,
                realFieldName,
                change.oldValue,
              ),
          newValue: masked
            ? SENSITIVE_MASK
            : translateFieldValue(
                query.aggregateType,
                realFieldName,
                change.newValue,
              ),
        };
      }),
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  private buildDefaultReason(
    aggregateType: string,
    eventType: AuditEventType,
    changes: EntityFieldChange[],
  ): string {
    const labels = changes.map((change) =>
      getFieldLabel(aggregateType, change.fieldName),
    );
    if (eventType === AuditEventType.DELETED) return 'Đã xoá bản ghi';
    if (eventType === AuditEventType.STATUS_CHANGED) {
      return labels.length
        ? `Đổi trạng thái: ${labels.join(', ')}`
        : 'Đổi trạng thái';
    }
    return labels.length
      ? `Cập nhật: ${labels.join(', ')}`
      : 'Cập nhật bản ghi';
  }
}
