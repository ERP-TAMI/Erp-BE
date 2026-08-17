import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_event_changes')
export class AuditEventChange {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ type: 'uuid', name: 'audit_event_id' })
  auditEventId: string;

  @Column({ type: 'varchar', length: 150, name: 'field_name' })
  fieldName: string;

  @Column({ type: 'jsonb', nullable: true, name: 'old_value' })
  oldValue: string;

  @Column({ type: 'jsonb', nullable: true, name: 'new_value' })
  newValue: string;
}
