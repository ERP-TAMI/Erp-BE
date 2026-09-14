import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource, Repository } from 'typeorm';
import { User } from './entities/User.entity';
import { UserSession } from './entities/UserSession.entity';
import { RecordStatus } from '../../common/enums/database.enums';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { verifyPassword } from '../../common/security/password.util';
import { generateRefreshToken, hashRefreshToken } from './refresh-token.util';
import {
  LOCKOUT_MINUTES,
  LOGIN_FAILED_THRESHOLD,
  REFRESH_TOKEN_TTL_DAYS,
} from './auth.constants';
import { AuthUserDto } from './dto/auth-response.dto';
import { JwtPayload } from './jwt-payload.type';
import { NotificationsService } from '../notifications/notifications.service';
import { SmtpMailService } from './smtp-mail.service';

export type SessionMeta = {
  userAgent?: string;
  ipAddress?: string;
};

export type LoginResult = {
  accessToken: string;
  refreshToken: string;
  user: AuthUserDto;
};

type RoleInfo = {
  roleCode: string;
  roleName: string;
  permissions: string[];
};

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly notifications: NotificationsService,
    private readonly mail: SmtpMailService,
  ) {}

  async login(
    email: string,
    password: string,
    meta: SessionMeta,
  ): Promise<LoginResult> {
    const user = await this.userRepository.findOne({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Email hoặc mật khẩu không đúng.',
      });
    }

    this.assertAccountUsable(user);

    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches) {
      const failedLogin = await this.registerFailedLogin(user.id);
      if (failedLogin.lockoutUntil) {
        throw new ForbiddenException({
          code: ErrorCode.ACCOUNT_TEMPORARILY_LOCKED,
          message:
            'Tài khoản đang tạm khoá do đăng nhập sai nhiều lần. Vui lòng thử lại sau.',
          lockedUntil: failedLogin.lockoutUntil.toISOString(),
        });
      }
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Email hoặc mật khẩu không đúng.',
      });
    }

    const roleInfo = await this.getRoleInfo(user.id);
    if (!roleInfo) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Tài khoản chưa được gán vai trò.',
      });
    }

    await this.userRepository.update(user.id, {
      loginFailedCount: 0,
      lockoutUntil: null,
      lastLoginAt: new Date(),
    });

    return this.issueSession(user, roleInfo, meta);
  }

  async refresh(
    rawToken: string | undefined,
    meta: SessionMeta,
  ): Promise<LoginResult> {
    if (!rawToken) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Phiên đăng nhập không hợp lệ.',
      });
    }

    const tokenHash = hashRefreshToken(rawToken);
    const session = await this.sessionRepository.findOne({
      where: { refreshTokenHash: tokenHash },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ.',
      });
    }

    const user = await this.userRepository.findOne({
      where: { id: session.userId },
    });
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Phiên đăng nhập không hợp lệ.',
      });
    }
    this.assertAccountUsable(user);

    const roleInfo = await this.getRoleInfo(user.id);
    if (!roleInfo) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Tài khoản chưa được gán vai trò.',
      });
    }

    await this.sessionRepository.update(session.id, {
      revokedAt: new Date(),
      revokeReason: 'rotated',
    });

    return this.issueSession(user, roleInfo, meta);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) {
      return;
    }

    const tokenHash = hashRefreshToken(rawToken);
    const session = await this.sessionRepository.findOne({
      where: { refreshTokenHash: tokenHash },
    });

    if (session && !session.revokedAt) {
      await this.sessionRepository.update(session.id, {
        revokedAt: new Date(),
        revokeReason: 'logout',
      });
    }
  }

  async getMe(userId: string): Promise<AuthUserDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Phiên đăng nhập không hợp lệ.',
      });
    }

    const roleInfo = await this.getRoleInfo(user.id);
    if (!roleInfo) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Tài khoản chưa được gán vai trò.',
      });
    }

    return this.toAuthUserDto(user, roleInfo);
  }

  private assertAccountUsable(user: User): void {
    if (user.status !== RecordStatus.ACTIVE) {
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_INACTIVE,
        message:
          'Tài khoản của bạn đã bị vô hiệu hoá. Vui lòng liên hệ quản trị viên.',
      });
    }

    if (user.manuallyLockedAt) {
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_MANUALLY_LOCKED,
        message: 'Tài khoản đã bị quản trị viên khóa.',
      });
    }

    if (user.lockoutUntil && user.lockoutUntil.getTime() > Date.now()) {
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_TEMPORARILY_LOCKED,
        message:
          'Tài khoản đang tạm khoá do đăng nhập sai nhiều lần. Vui lòng thử lại sau.',
        lockedUntil: user.lockoutUntil.toISOString(),
      });
    }
  }

  private async registerFailedLogin(
    userId: string,
  ): Promise<{ lockoutUntil: Date | null }> {
    const result = await this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const user = await users.findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        return { lockoutUntil: null, emailDelivery: null };
      }

      const now = new Date();
      if (user.lockoutUntil && user.lockoutUntil.getTime() > now.getTime()) {
        return { lockoutUntil: user.lockoutUntil, emailDelivery: null };
      }
      if (user.lockoutUntil) {
        user.lockoutUntil = null;
        user.loginFailedCount = 0;
      }

      user.loginFailedCount += 1;
      if (user.loginFailedCount < LOGIN_FAILED_THRESHOLD) {
        await users.save(user);
        return { lockoutUntil: null, emailDelivery: null };
      }

      const lockoutUntil = new Date(
        now.getTime() + LOCKOUT_MINUTES * 60 * 1000,
      );
      user.lockoutUntil = lockoutUntil;
      await users.save(user);
      const { deliveryId } =
        await this.notifications.createTemporaryAccountLockEmailDelivery(
          manager,
          { userId: user.id, lockedAt: now, lockoutUntil },
        );
      return {
        lockoutUntil,
        emailDelivery: {
          deliveryId,
          email: user.email,
          fullName: user.fullName,
          lockedAt: now,
          lockoutUntil,
        },
      };
    });

    if (result.emailDelivery) {
      void this.deliverTemporaryLockEmail(result.emailDelivery);
    }
    return { lockoutUntil: result.lockoutUntil };
  }

  private async deliverTemporaryLockEmail(input: {
    deliveryId: string;
    email: string;
    fullName: string;
    lockedAt: Date;
    lockoutUntil: Date;
  }): Promise<void> {
    try {
      await this.mail.sendTemporaryAccountLockEmail(input);
      await this.notifications.recordEmailDeliverySent(input.deliveryId);
    } catch (error) {
      try {
        await this.notifications.recordEmailDeliveryFailed(
          input.deliveryId,
          error,
        );
      } catch {
        // Login lock state must not be affected by delivery-status persistence.
      }
    }
  }

  private async issueSession(
    user: User,
    roleInfo: RoleInfo,
    meta: SessionMeta,
  ): Promise<LoginResult> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roleCode: roleInfo.roleCode,
      permissions: roleInfo.permissions,
      authVersion: user.authVersion,
    };
    const accessToken = this.jwtService.sign(payload);

    const refreshToken = generateRefreshToken();
    const session = this.sessionRepository.create({
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt: new Date(
        Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
      ),
    });
    await this.sessionRepository.save(session);

    return {
      accessToken,
      refreshToken,
      user: this.toAuthUserDto(user, roleInfo),
    };
  }

  private toAuthUserDto(user: User, roleInfo: RoleInfo): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      roleCode: roleInfo.roleCode,
      roleName: roleInfo.roleName,
      permissions: roleInfo.permissions,
    };
  }

  private async getRoleInfo(userId: string): Promise<RoleInfo | null> {
    const rows: Array<{
      role_code: string;
      role_name: string;
      permissions: string[] | null;
    }> = await this.dataSource.query(
      `SELECT r.code as role_code, r.name as role_name,
              array_remove(array_agg(p.code), NULL) as permissions
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = $1
       GROUP BY r.code, r.name`,
      [userId],
    );

    if (rows.length === 0) {
      return null;
    }

    return {
      roleCode: rows[0].role_code,
      roleName: rows[0].role_name,
      permissions: rows[0].permissions ?? [],
    };
  }
}
