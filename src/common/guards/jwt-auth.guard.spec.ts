import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard, ALLOW_FORCED_PASSWORD_CHANGE } from './jwt-auth.guard';
import { ErrorCode } from '../enums/error-code.enum';

describe('JwtAuthGuard forced password change', () => {
  const handler = () => undefined;
  let reflector: jest.Mocked<Reflector>;
  let guard: JwtAuthGuard;
  let context: ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<Reflector>;
    guard = new JwtAuthGuard(reflector);
    context = { getHandler: () => handler } as unknown as ExecutionContext;
  });

  it('blocks protected routes while the user still has a temporary password', () => {
    let thrown: unknown;
    try {
      guard.handleRequest(
        null,
        { id: 'user-id', mustChangePassword: true },
        null,
        context,
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect((thrown as ForbiddenException).getResponse()).toMatchObject({
      code: ErrorCode.PASSWORD_CHANGE_REQUIRED,
    });
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      ALLOW_FORCED_PASSWORD_CHANGE,
      [handler],
    );
  });

  it('allows only explicitly marked password setup endpoints', () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    expect(
      guard.handleRequest(
        null,
        { id: 'user-id', mustChangePassword: true },
        null,
        context,
      ),
    ).toEqual({ id: 'user-id', mustChangePassword: true });
  });
});
