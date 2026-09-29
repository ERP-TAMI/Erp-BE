import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('http_audit_logs')
export class HttpAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt: Date;

  @Column({ type: 'varchar', length: 10 })
  method: string;

  @Column({ type: 'varchar', length: 1000 })
  path: string;

  @Column({ type: 'integer', nullable: true, name: 'status_code' })
  statusCode: number | null;

  @Column({ type: 'integer', nullable: true, name: 'duration_ms' })
  durationMs: number | null;

  @Column({ type: 'uuid', nullable: true, name: 'actor_user_id' })
  actorUserId: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'actor_identifier',
  })
  actorIdentifier: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true, name: 'actor_role' })
  actorRole: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'ip_address' })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'user_agent' })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'request_id' })
  requestId: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'query_params' })
  queryParams: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true, name: 'request_body' })
  requestBody: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage: string | null;
}
