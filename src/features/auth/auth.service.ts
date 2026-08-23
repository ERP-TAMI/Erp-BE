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
  ) {}

  async login(
    email: string,
    password: string,
    meta: SessionMeta,
  ): Promise<LoginResult> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Email hoặc mật khẩu không đúng.',
      });
    }

    this.assertAccountUsable(user);

    const passwordMatches = await verifyPassword(password, user.passwordHash);
    if (!passwordMatches) {
      await this.registerFailedLogin(user);
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

    if (user.lockoutUntil && user.lockoutUntil.getTime() > Date.now()) {
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_LOCKED,
        message:
          'Tài khoản đang tạm khoá do đăng nhập sai nhiều lần. Vui lòng thử lại sau.',
      });
    }
  }

  private async registerFailedLogin(user: User): Promise<void> {
    const failedCount = user.loginFailedCount + 1;
    const patch: Partial<User> = { loginFailedCount: failedCount };
    if (failedCount >= LOGIN_FAILED_THRESHOLD) {
      patch.lockoutUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    }
    await this.userRepository.update(user.id, patch);
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
