import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

const DASHBOARD_ROLE_CODES = new Set([
  'SA',
  'TPKH',
  'NVKH',
  'RD',
  'ACCOUNTING',
]);

type DashboardRequest = {
  user?: { roleCode?: string };
};

@Injectable()
export class DashboardAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<DashboardRequest>();
    if (
      !request.user?.roleCode ||
      !DASHBOARD_ROLE_CODES.has(request.user.roleCode)
    ) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập dashboard nghiệp vụ.',
      );
    }
    return true;
  }
}
