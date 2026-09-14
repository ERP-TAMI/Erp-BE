import { User } from './User.entity';
import { Role } from './Role.entity';
import { Permission } from './Permission.entity';
import { UserRole } from './UserRole.entity';
import { RolePermission } from './RolePermission.entity';
import { UserSession } from './UserSession.entity';
import { UserPasswordSetupToken } from './UserPasswordSetupToken.entity';

export {
  User,
  Role,
  Permission,
  UserRole,
  RolePermission,
  UserSession,
  UserPasswordSetupToken,
};
export const AUTH_ENTITIES = [
  User,
  Role,
  Permission,
  UserRole,
  RolePermission,
  UserSession,
  UserPasswordSetupToken,
];
