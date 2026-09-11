import { ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { UserRoleCode } from './dto/query-users.dto';
import { UserAccountStatus } from './dto/user-account-status.enum';

const IT_MANAGED_ROLES = new Set<UserRoleCode>([
  UserRoleCode.TPKH,
  UserRoleCode.NVKH,
  UserRoleCode.RD,
  UserRoleCode.ACCOUNTING,
]);

function forbidden(message: string): never {
  throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message });
}

export function assertCanCreateUser(
  actorRole: string,
  targetRole: UserRoleCode,
): void {
  if (actorRole === UserRoleCode.SA) return;
  if (actorRole === UserRoleCode.IT && IT_MANAGED_ROLES.has(targetRole)) return;
  forbidden('Bạn không có quyền tạo người dùng với vai trò này.');
}

export function assertCanUpdateUser(input: {
  actorId: string;
  actorRole: string;
  targetId: string;
  currentRole: UserRoleCode;
  nextRole: UserRoleCode;
  nextStatus: UserAccountStatus;
}): void {
  const isSelf = input.actorId === input.targetId;
  if (isSelf) {
    if (input.currentRole !== input.nextRole) {
      forbidden('Bạn không được tự thay đổi vai trò của chính mình.');
    }
    if (input.nextStatus !== UserAccountStatus.ACTIVE) {
      forbidden('Bạn không được tự khóa hoặc vô hiệu hóa chính mình.');
    }
    return;
  }

  if (input.actorRole === UserRoleCode.SA) return;
  if (
    input.actorRole === UserRoleCode.IT &&
    IT_MANAGED_ROLES.has(input.currentRole) &&
    IT_MANAGED_ROLES.has(input.nextRole)
  ) {
    return;
  }
  forbidden('Bạn không có quyền sửa người dùng này.');
}
