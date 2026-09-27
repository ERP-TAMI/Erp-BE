import {
  BadRequestException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { RecordStatus } from '../../common/enums/database.enums';
import { hashPassword } from '../../common/security/password.util';
import { User } from './entities/User.entity';
import { UserPasswordSetupToken } from './entities/UserPasswordSetupToken.entity';
import {
  generatePasswordSetupToken,
  hashPasswordSetupToken,
  passwordSetupExpiry,
} from './password-setup-token.util';
import { SmtpMailService } from './smtp-mail.service';
import { PasswordSetupEmailStatus } from './password-setup-email-status.enum';
import { PasswordTokenPurpose } from './password-token-purpose.enum';

export type InvitationStatus = 'sent' | 'failed';
export type IssuedPasswordSetup = { user: User; token: string };

@Injectable()
export class PasswordSetupService {
  private readonly logger = new Logger(PasswordSetupService.name);

  constructor(
    @InjectRepository(UserPasswordSetupToken)
    private readonly tokens: Repository<UserPasswordSetupToken>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mail: SmtpMailService,
  ) {}

  async issue(
    manager: EntityManager,
    userId: string,
    createdBy: string,
  ): Promise<IssuedPasswordSetup> {
    const user = await manager.getRepository(User).findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'Không tìm thấy người dùng.',
      });
    }
    this.assertPendingUser(user);

    const rawToken = generatePasswordSetupToken();
    const now = new Date();
    const tokenRepository = manager.getRepository(UserPasswordSetupToken);
    await this.revokeActive(manager, user.id, now);
    await tokenRepository.save(
      tokenRepository.create({
        userId: user.id,
        tokenHash: hashPasswordSetupToken(rawToken),
        expiresAt: passwordSetupExpiry(now),
        usedAt: null,
        revokedAt: null,
        createdBy,
        purpose: PasswordTokenPurpose.ACCOUNT_SETUP,
        deliveryStatus: PasswordSetupEmailStatus.PENDING,
        deliveryAttemptedAt: null,
      }),
    );
    return { user, token: rawToken };
  }

  async revokeActive(
    manager: EntityManager,
    userId: string,
    revokedAt = new Date(),
  ): Promise<void> {
    await manager
      .getRepository(UserPasswordSetupToken)
      .update({ userId, usedAt: IsNull(), revokedAt: IsNull() }, { revokedAt });
  }

  async deliver(invitation: IssuedPasswordSetup): Promise<InvitationStatus> {
    let deliveryStatus: PasswordSetupEmailStatus;
    try {
      await this.mail.sendPasswordSetupEmail({
        email: invitation.user.email,
        fullName: invitation.user.fullName,
        token: invitation.token,
        accountAvailable: this.isAccountAvailable(invitation.user),
      });
      deliveryStatus = PasswordSetupEmailStatus.SENT;
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown SMTP error';
      this.logger.error(
        `Password setup email failed for user ${invitation.user.id} (${invitation.user.email}): ${reason}`,
      );
      deliveryStatus = PasswordSetupEmailStatus.FAILED;
    }
    await this.recordDeliveryStatus(invitation, deliveryStatus);
    return deliveryStatus;
  }

  private async recordDeliveryStatus(
    invitation: IssuedPasswordSetup,
    deliveryStatus: PasswordSetupEmailStatus,
  ): Promise<void> {
    try {
      await this.tokens.update(
        { tokenHash: hashPasswordSetupToken(invitation.token) },
        { deliveryStatus, deliveryAttemptedAt: new Date() },
      );
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Unknown persistence error';
      this.logger.error(
        `Password setup delivery status could not be saved for user ${invitation.user.id}: ${reason}`,
      );
    }
  }

  async validate(token: string): Promise<{ valid: true; expiresAt: string }> {
    const setupToken = await this.tokens.findOne({
      where: { tokenHash: hashPasswordSetupToken(token) },
    });
    this.assertUsable(setupToken, PasswordTokenPurpose.ACCOUNT_SETUP);
    const user = await this.users.findOne({
      where: { id: setupToken.userId },
    });
    this.assertPendingUser(user, ErrorCode.PASSWORD_SETUP_TOKEN_INVALID);
    return { valid: true, expiresAt: setupToken.expiresAt.toISOString() };
  }

  async complete(token: string, password: string): Promise<void> {
    const tokenHash = hashPasswordSetupToken(token);
    const candidate = await this.tokens.findOne({ where: { tokenHash } });
    this.assertUsable(candidate, PasswordTokenPurpose.ACCOUNT_SETUP);

    await this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const user = await userRepository.findOne({
        where: { id: candidate.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw new BadRequestException({
          code: ErrorCode.PASSWORD_SETUP_TOKEN_INVALID,
          message: 'Liên kết đặt mật khẩu không hợp lệ.',
        });
      }
      this.assertPendingUser(user, ErrorCode.PASSWORD_SETUP_TOKEN_INVALID);

      const tokenRepository = manager.getRepository(UserPasswordSetupToken);
      const setupToken = await tokenRepository.findOne({
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });
      this.assertUsable(setupToken, PasswordTokenPurpose.ACCOUNT_SETUP);

      const passwordHash = await hashPassword(password);
      user.passwordHash = passwordHash;
      user.mustChangePassword = false;
      await userRepository.save(user);
      setupToken.usedAt = new Date();
      await tokenRepository.save(setupToken);
    });
  }

  private assertPendingUser(
    user: User | null,
    code: ErrorCode = ErrorCode.BAD_REQUEST,
  ): void {
    const invalidLink = code === ErrorCode.PASSWORD_SETUP_TOKEN_INVALID;
    if (!user?.mustChangePassword) {
      throw new BadRequestException({
        code,
        message: invalidLink
          ? 'Liên kết đặt mật khẩu không hợp lệ.'
          : 'Người dùng đã thiết lập mật khẩu.',
      });
    }
    if (!this.isAccountAvailable(user)) {
      throw new BadRequestException({
        code,
        message: invalidLink
          ? 'Liên kết đặt mật khẩu không hợp lệ.'
          : 'Tài khoản không hoạt động hoặc đang bị khóa.',
      });
    }
  }

  private isAccountAvailable(user: User): boolean {
    return (
      user.status === RecordStatus.ACTIVE &&
      !user.manuallyLockedAt &&
      (!user.lockoutUntil || user.lockoutUntil.getTime() <= Date.now())
    );
  }

  private assertUsable(
    token: UserPasswordSetupToken | null,
    expectedPurpose: PasswordTokenPurpose,
  ): asserts token is UserPasswordSetupToken {
    if (!token || token.purpose !== expectedPurpose) {
      throw new BadRequestException({
        code: ErrorCode.PASSWORD_SETUP_TOKEN_INVALID,
        message: 'Liên kết đặt mật khẩu không hợp lệ.',
      });
    }
    if (token.revokedAt) {
      throw new GoneException({
        code: ErrorCode.PASSWORD_SETUP_TOKEN_REVOKED,
        message: 'Liên kết đặt mật khẩu đã bị thu hồi.',
      });
    }
    if (token.usedAt) {
      throw new GoneException({
        code: ErrorCode.PASSWORD_SETUP_TOKEN_USED,
        message: 'Liên kết đặt mật khẩu đã được sử dụng.',
      });
    }
    if (token.expiresAt.getTime() <= Date.now()) {
      throw new GoneException({
        code: ErrorCode.PASSWORD_SETUP_TOKEN_EXPIRED,
        message: 'Liên kết đặt mật khẩu đã hết hạn.',
      });
    }
  }
}
