import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { DashboardController } from '../dashboard.controller';
import { DashboardAccessGuard } from '../dashboard-access.guard';

describe('DashboardAccessGuard', () => {
  const guard = new DashboardAccessGuard();

  it.each(['SA', 'TPKH', 'NVKH', 'RD', 'ACCOUNTING'])(
    'allows %s to read the operational dashboard',
    (roleCode) => {
      const request = { user: { roleCode } };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(context)).toBe(true);
    },
  );

  it.each(['IT', 'UNKNOWN', undefined])('blocks role %s', (roleCode) => {
    const request = { user: roleCode ? { roleCode } : undefined };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('runs authentication before checking the role', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DashboardController)).toEqual([
      JwtAuthGuard,
      PermissionGuard,
      DashboardAccessGuard,
    ]);
  });
});
