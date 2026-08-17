export enum RecordStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum PoStatus {
  DRAFT = 'draft',
  PENDING_RD = 'pending_rd',
  IN_PROGRESS = 'in_progress',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

export enum ProductStatus {
  DRAFT = 'draft',
  IN_REVIEW = 'in_review',
  SAMPLING = 'sampling',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

export enum StyleStatus {
  DRAFT = 'draft',
  APPROVED = 'approved',
  ACTIVE = 'active',
}

export enum SampleStatus {
  WORKING = 'working',
  NEEDS_REVISION = 'needs_revision',
  APPROVED = 'approved',
}

export enum ProductionDocStatus {
  DRAFT = 'draft',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export enum UploadStatus {
  PENDING = 'pending',
  READY = 'ready',
  FAILED = 'failed',
  QUARANTINED = 'quarantined',
}

export enum DocumentPurpose {
  PO_ORIGINAL = 'po_original',
  TECH_PACK = 'tech_pack',
  MATERIAL_PDF = 'material_pdf',
  SAMPLE_IMAGE = 'sample_image',
  TRANSLATION = 'translation',
  COLOR_CARD = 'color_card',
  PRODUCTION_DOC = 'production_doc',
  AVATAR = 'avatar',
  OTHER = 'other',
}

export enum BomStatus {
  DRAFT = 'draft',
  WAIT_RD = 'wait_rd',
  WAIT_TPKH_CONFIRM = 'wait_tpkh_confirm',
  WAIT_ACCOUNTING = 'wait_accounting',
  WAIT_SA_APPROVE = 'wait_sa_approve',
  CLOSED = 'closed',
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
}

export enum NotificationDeliveryStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum AuditEventType {
  CREATED = 'created',
  UPDATED = 'updated',
  DELETED = 'deleted',
  STATUS_CHANGED = 'status_changed',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  DOCUMENT_LINKED = 'document_linked',
  DOCUMENT_UNLINKED = 'document_unlinked',
  DOCUMENT_VERSION_ADDED = 'document_version_added',
  COPIED = 'copied',
  SYNCED = 'synced',
  LOGIN = 'login',
  PASSWORD_CHANGED = 'password_changed',
  ROLE_CHANGED = 'role_changed',
}
