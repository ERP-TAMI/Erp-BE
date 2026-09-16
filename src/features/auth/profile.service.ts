import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  AuditEventType,
  RecordStatus,
} from '../../common/enums/database.enums';
import { ErrorCode } from '../../common/enums/error-code.enum';
import {
  hashPassword,
  verifyPassword,
} from '../../common/security/password.util';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { AuthUserDto } from './dto/auth-response.dto';
import { ChangeMyPasswordDto, UpdateMyProfileDto } from './dto/profile.dto';
import { User } from './entities/User.entity';
import { PasswordSetupService } from './password-setup.service';

type ProfileActor = { id: string; roleCode: string };

@Injectable()
export class ProfileService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly passwordSetup: PasswordSetupService,
    private readonly auth: AuthService,
  ) {}

  async updateProfile(
    dto: UpdateMyProfileDto,
    actor: ProfileActor,
  ): Promise<AuthUserDto> {
    await this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const user = await users.findOne({
        where: { id: actor.id },
        lock: { mode: 'pessimistic_write' },
      });
      this.assertAccountUsable(user);

      const changes = [
        ...(user.fullName !== dto.fullName
          ? [
              {
                fieldName: 'fullName',
                oldValue: user.fullName,
                newValue: dto.fullName,
              },
            ]
          : []),
        ...(dto.phone !== undefined && user.phone !== dto.phone
          ? [
              {
                fieldName: 'phone',
                oldValue: user.phone,
                newValue: dto.phone,
              },
            ]
          : []),
      ];

      if (changes.length === 0) return;
      user.fullName = dto.fullName;
      if (dto.phone !== undefined) user.phone = dto.phone;
      await users.save(user);
      await this.audit.recordUserChange(manager, {
        actorId: actor.id,
        actorRole: actor.roleCode,
        targetId: user.id,
        targetLabel: user.email,
        eventType: AuditEventType.UPDATED,
        reason: 'Người dùng tự cập nhật hồ sơ cá nhân.',
        changes,
      });
    });

    return this.auth.getMe(actor.id);
  }

  async changePassword(
    dto: ChangeMyPasswordDto,
    actor: ProfileActor,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const user = await users.findOne({
        where: { id: actor.id },
        lock: { mode: 'pessimistic_write' },
      });
      this.assertAccountUsable(user);

      const currentPasswordMatches = await verifyPassword(
        dto.currentPassword,
        user.passwordHash,
      );
      if (!currentPasswordMatches) {
        throw new BadRequestException({
          code: ErrorCode.CURRENT_PASSWORD_INCORRECT,
          message: 'Mật khẩu hiện tại không đúng.',
        });
      }

      const reusesCurrentPassword = await verifyPassword(
        dto.newPassword,
        user.passwordHash,
      );
      if (reusesCurrentPassword) {
        throw new BadRequestException({
          code: ErrorCode.PASSWORD_REUSE_NOT_ALLOWED,
          message: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
        });
      }

      user.passwordHash = await hashPassword(dto.newPassword);
      await users.save(user);
      await this.passwordSetup.revokeActive(manager, user.id);
      await this.audit.recordUserChange(manager, {
        actorId: actor.id,
        actorRole: actor.roleCode,
        targetId: user.id,
        targetLabel: user.email,
        eventType: AuditEventType.PASSWORD_CHANGED,
        reason: 'Người dùng tự đổi mật khẩu.',
        changes: [],
      });
    });
  }

  private assertAccountUsable(user: User | null): asserts user is User {
    const isLocked =
      !!user?.manuallyLockedAt ||
      (!!user?.lockoutUntil && user.lockoutUntil.getTime() > Date.now());
    if (!user || user.status !== RecordStatus.ACTIVE || isLocked) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Phiên đăng nhập không hợp lệ.',
      });
    }

    if (user.mustChangePassword) {
      throw new ForbiddenException({
        code: ErrorCode.PASSWORD_SETUP_REQUIRED,
        message: 'Bạn cần hoàn tất thiết lập mật khẩu trước.',
      });
    }
  }
}
