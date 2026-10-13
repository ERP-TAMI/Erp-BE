import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ErrorCode } from '../enums/error-code.enum';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  handleRequest<TUser = { mustChangePassword?: boolean }>(
    error: unknown,
    user: TUser | false | null,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    const authenticatedUser = super.handleRequest<TUser>(
      error,
      user,
      info,
      context,
    ) as TUser & { mustChangePassword?: boolean };
    const canChangePassword = this.reflector.getAllAndOverride<boolean>(
      ALLOW_FORCED_PASSWORD_CHANGE,
      [context.getHandler()],
    );
    if (authenticatedUser.mustChangePassword && !canChangePassword) {
      throw new ForbiddenException({
        code: ErrorCode.PASSWORD_CHANGE_REQUIRED,
        message:
          'Bạn cần đổi mật khẩu tạm trước khi tiếp tục sử dụng hệ thống.',
      });
    }
    return authenticatedUser;
  }
}

export const ALLOW_FORCED_PASSWORD_CHANGE = 'allow-forced-password-change';
export const AllowForcedPasswordChange = () =>
  SetMetadata(ALLOW_FORCED_PASSWORD_CHANGE, true);
