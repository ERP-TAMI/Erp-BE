import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { RecordStatus } from '../../common/enums/database.enums';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { hashPassword } from '../../common/security/password.util';
import { User } from './entities/User.entity';
import { UserPasswordSetupToken } from './entities/UserPasswordSetupToken.entity';
import { UserSession } from './entities/UserSession.entity';
import { PasswordSetupEmailStatus } from './password-setup-email-status.enum';
import {
  generatePasswordSetupToken,
  hashPasswordSetupToken,
  passwordSetupExpiry,
} from './password-setup-token.util';
import { PasswordTokenPurpose } from './password-token-purpose.enum';
import { SmtpMailService } from './smtp-mail.service';

const PASSWORD_RESET_REQUEST_COOLDOWN_MS = 60_000;

export type IssuedPasswordReset = { user: User; token: string };

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(UserPasswordSetupToken)
    private readonly tokens: Repository<UserPasswordSetupToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mail: SmtpMailService,
  ) {}

  async request(email: string): Promise<IssuedPasswordReset> {
    const normalizedEmail = email.trim().toLowerCase();
    return this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const user = await users.findOne({
        where: { email: normalizedEmail },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw new NotFoundException({
          code: ErrorCode.EMAIL_NOT_FOUND,
          message: 'Email này chưa tồn tại trong hệ thống.',
        });
      }
      this.assertAccountAvailable(user);

      const tokenRepository = manager.getRepository(UserPasswordSetupToken);
      const latestReset = await tokenRepository.findOne({
        where: {
          userId: user.id,
          purpose: PasswordTokenPurpose.PASSWORD_RESET,
        },
        order: { createdAt: 'DESC' },
      });
      const now = new Date();
      if (
        latestReset?.createdAt &&
        now.getTime() - latestReset.createdAt.getTime() <
          PASSWORD_RESET_REQUEST_COOLDOWN_MS
      ) {
        throw new HttpException(
          {
            code: ErrorCode.PASSWORD_RESET_REQUEST_TOO_SOON,
            message: 'Vui lòng chờ một phút trước khi yêu cầu email mới.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await tokenRepository.update(
        { userId: user.id, usedAt: IsNull(), revokedAt: IsNull() },
        { revokedAt: now },
      );
      const rawToken = generatePasswordSetupToken();
      await tokenRepository.save(
        tokenRepository.create({
          userId: user.id,
          tokenHash: hashPasswordSetupToken(rawToken),
          expiresAt: passwordSetupExpiry(now),
          usedAt: null,
          revokedAt: null,
          createdBy: null,
          purpose: PasswordTokenPurpose.PASSWORD_RESET,
          deliveryStatus: PasswordSetupEmailStatus.PENDING,
          deliveryAttemptedAt: null,
        }),
      );
      return { user, token: rawToken };
    });
  }

  async deliver(reset: IssuedPasswordReset): Promise<void> {
    let deliveryStatus: PasswordSetupEmailStatus;
    try {
      await this.mail.sendPasswordResetEmail({
        email: reset.user.email,
        fullName: reset.user.fullName,
        token: reset.token,
      });
      deliveryStatus = PasswordSetupEmailStatus.SENT;
    } catch {
      deliveryStatus = PasswordSetupEmailStatus.FAILED;
      this.logger.error(
        `Password reset email failed for user ${reset.user.id}`,
      );
    }

    try {
      await this.tokens.update(
        { tokenHash: hashPasswordSetupToken(reset.token) },
        { deliveryStatus, deliveryAttemptedAt: new Date() },
      );
    } catch {
      this.logger.error(
        `Password reset delivery status could not be saved for user ${reset.user.id}`,
      );
    }
  }

  async validate(token: string): Promise<{ valid: true; expiresAt: string }> {
    const resetToken = await this.tokens.findOne({
      where: { tokenHash: hashPasswordSetupToken(token) },
    });
    this.assertUsable(resetToken);
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: resetToken.userId },
    });
    this.assertAccountAvailable(user);
    return { valid: true, expiresAt: resetToken.expiresAt.toISOString() };
  }

  async complete(token: string, password: string): Promise<void> {
    const tokenHash = hashPasswordSetupToken(token);
    const candidate = await this.tokens.findOne({ where: { tokenHash } });
    this.assertUsable(candidate);

    await this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const user = await users.findOne({
        where: { id: candidate.userId },
        lock: { mode: 'pessimistic_write' },
      });
      this.assertAccountAvailable(user);

      const tokenRepository = manager.getRepository(UserPasswordSetupToken);
      const resetToken = await tokenRepository.findOne({
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });
      this.assertUsable(resetToken);

      user.passwordHash = await hashPassword(password);
      user.authVersion += 1;
      user.loginFailedCount = 0;
      user.lockoutUntil = null;
      await users.save(user);

      await manager
        .getRepository(UserSession)
        .update(
          { userId: user.id, revokedAt: IsNull() },
          { revokedAt: new Date(), revokeReason: 'password_reset' },
        );
      resetToken.usedAt = new Date();
      await tokenRepository.save(resetToken);
    });
  }

  private assertAccountAvailable(user: User | null): asserts user is User {
    if (
      !user ||
      user.status !== RecordStatus.ACTIVE ||
      user.mustChangePassword ||
      user.manuallyLockedAt ||
      (user.lockoutUntil && user.lockoutUntil.getTime() > Date.now())
    ) {
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_NOT_AVAILABLE_FOR_PASSWORD_RESET,
        message:
          'Tài khoản của bạn đang bị tạm khóa hoặc đã bị vô hiệu hóa. Vui lòng liên hệ IT/Admin.',
      });
    }
  }

  private assertUsable(
    token: UserPasswordSetupToken | null,
  ): asserts token is UserPasswordSetupToken {
    if (!token || token.purpose !== PasswordTokenPurpose.PASSWORD_RESET) {
      throw new BadRequestException({
        code: ErrorCode.PASSWORD_RESET_TOKEN_INVALID,
        message: 'Liên kết đặt lại mật khẩu không hợp lệ.',
      });
    }
    if (token.revokedAt) {
      throw new GoneException({
        code: ErrorCode.PASSWORD_RESET_TOKEN_REVOKED,
        message: 'Liên kết đặt lại mật khẩu đã bị thu hồi.',
      });
    }
    if (token.usedAt) {
      throw new GoneException({
        code: ErrorCode.PASSWORD_RESET_TOKEN_USED,
        message: 'Liên kết đặt lại mật khẩu đã được sử dụng.',
      });
    }
    if (token.expiresAt.getTime() <= Date.now()) {
      throw new GoneException({
        code: ErrorCode.PASSWORD_RESET_TOKEN_EXPIRED,
        message: 'Liên kết đặt lại mật khẩu đã hết hạn.',
      });
    }
  }
}
