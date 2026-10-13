export enum UserAccountStatus {
  ACTIVE = 'active',
  LOCKED = 'locked',
  PENDING_SETUP = 'pending_setup',
  INACTIVE = 'inactive',
}

export const EDITABLE_USER_ACCOUNT_STATUSES = [
  UserAccountStatus.ACTIVE,
  UserAccountStatus.LOCKED,
  UserAccountStatus.INACTIVE,
] as const;

export type EditableUserAccountStatus =
  (typeof EDITABLE_USER_ACCOUNT_STATUSES)[number];
