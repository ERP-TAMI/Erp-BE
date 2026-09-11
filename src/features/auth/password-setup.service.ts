import {
  BadRequestException,
  GoneException,
  Injectable,
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

export type InvitationStatus = 'sent' | 'failed';
export type IssuedPasswordSetup = { user: User; token: string };

@Injectable()
export class PasswordSetupService {
  constructor(
    @InjectRepository(UserPasswordSetupToken)
    private readonly tokens: Repository<UserPasswordSetupToken>,
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
    await tokenRepository.update(
      { userId: user.id, usedAt: IsNull() },
      { usedAt: now },
    );
    await tokenRepository.save(
      tokenRepository.create({
        userId: user.id,
        tokenHash: hashPasswordSetupToken(rawToken),
        expiresAt: passwordSetupExpiry(now),
        usedAt: null,
        createdBy,
      }),
    );
    return { user, token: rawToken };
  }

  async deliver(invitation: IssuedPasswordSetup): Promise<InvitationStatus> {
    try {
      await this.mail.sendPasswordSetupEmail({
        email: invitation.user.email,
        fullName: invitation.user.fullName,
        token: invitation.token,
        accountAvailable:
          invitation.user.status === RecordStatus.ACTIVE &&
          !invitation.user.manuallyLockedAt &&
          (!invitation.user.lockoutUntil ||
            invitation.user.lockoutUntil.getTime() <= Date.now()),
      });
      return 'sent';
    } catch {
      return 'failed';
    }
  }

  async validate(token: string): Promise<{ valid: true; expiresAt: string }> {
    const setupToken = await this.tokens.findOne({
      where: { tokenHash: hashPasswordSetupToken(token) },
    });
    this.assertUsable(setupToken);
    return { valid: true, expiresAt: setupToken.expiresAt.toISOString() };
  }

  async complete(token: string, password: string): Promise<void> {
    const tokenHash = hashPasswordSetupToken(token);
    const candidate = await this.tokens.findOne({ where: { tokenHash } });
    this.assertUsable(candidate);

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
      this.assertUsable(setupToken);

      const passwordHash = await hashPassword(password);
      user.passwordHash = passwordHash;
      user.mustChangePassword = false;
      await userRepository.save(user);
      setupToken.usedAt = new Date();
      await tokenRepository.save(setupToken);
    });
  }

  private assertPendingUser(
    user: User,
    code: ErrorCode = ErrorCode.BAD_REQUEST,
  ): void {
    if (!user.mustChangePassword) {
      throw new BadRequestException({
        code,
        message:
          code === ErrorCode.PASSWORD_SETUP_TOKEN_INVALID
            ? 'Liên kết đặt mật khẩu không hợp lệ.'
            : 'Người dùng đã thiết lập mật khẩu.',
      });
    }
  }

  private assertUsable(
    token: UserPasswordSetupToken | null,
  ): asserts token is UserPasswordSetupToken {
    if (!token) {
      throw new BadRequestException({
        code: ErrorCode.PASSWORD_SETUP_TOKEN_INVALID,
        message: 'Liên kết đặt mật khẩu không hợp lệ.',
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
