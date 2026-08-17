import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEventType } from '../../../common/enums/database.enums';

@Entity('audit_events')
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'actor_user_id' })
  actorUserId: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'actor_identifier',
  })
  actorIdentifier: string;

  @Column({ type: 'varchar', length: 80, name: 'aggregate_type' })
  aggregateType: string;

  @Column({ type: 'uuid', name: 'aggregate_id' })
  aggregateId: string;

  @Column({ type: 'uuid', nullable: true, name: 'parent_id' })
  parentId: string;

  @Column({
    type: 'enum',
    enum: AuditEventType,
    enumName: 'audit_event_type',
    name: 'event_type',
  })
  eventType: AuditEventType;

  @Column({ type: 'varchar', length: 30, nullable: true, name: 'actor_role' })
  actorRole: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'target_label',
  })
  targetLabel: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'uuid', nullable: true, name: 'correlation_id' })
  correlationId: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'request_id' })
  requestId: string;
}
