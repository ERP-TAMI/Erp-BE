import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import { PERMISSION_KEY } from '../decorators/permission.decorator';

function buildContext(user?: { permissions?: string[] }): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: PermissionGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    guard = new PermissionGuard(reflector);
  });

  it('allows the request through when the route requires no specific permission', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(buildContext(undefined))).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(PERMISSION_KEY, [
      {},
      {},
    ]);
  });

  it('allows the request when the user has the required permission', () => {
    reflector.getAllAndOverride.mockReturnValue('master_data.styles.manage');

    const context = buildContext({
      permissions: ['master_data.styles.view', 'master_data.styles.manage'],
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies the request when the user lacks the required permission', () => {
    reflector.getAllAndOverride.mockReturnValue('master_data.styles.manage');

    const context = buildContext({ permissions: ['master_data.styles.view'] });

    expect(guard.canActivate(context)).toBe(false);
  });

  it('denies the request when there is no authenticated user at all', () => {
    reflector.getAllAndOverride.mockReturnValue('master_data.styles.manage');

    expect(guard.canActivate(buildContext(undefined))).toBe(false);
  });

  it('denies the request when the user has no permissions array', () => {
    reflector.getAllAndOverride.mockReturnValue('master_data.styles.manage');

    expect(guard.canActivate(buildContext({}))).toBe(false);
  });
});
