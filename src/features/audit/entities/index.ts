import { AuditEvent } from './AuditEvent.entity';
import { AuditEventChange } from './AuditEventChange.entity';
import { HttpAuditLog } from './HttpAuditLog.entity';

export { AuditEvent, AuditEventChange, HttpAuditLog };
export const AUDIT_ENTITIES = [AuditEvent, AuditEventChange, HttpAuditLog];
