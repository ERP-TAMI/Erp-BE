import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, IsNull, QueryFailedError, Repository } from 'typeorm';
import { User } from '../auth/entities/User.entity';
import { QueryUsersDto, UserRoleCode } from './dto/query-users.dto';
import {
  EditableUserAccountStatus,
  UserAccountStatus,
} from './dto/user-account-status.enum';
import {
  UserListItemResponseDto,
  UserListResponseDto,
} from './dto/user-list-response.dto';
import {
  CreateUserResponseDto,
  MutateUserDto,
  UpdateUserDto,
  UpdateUserResponseDto,
} from './dto/mutate-user.dto';
import { Role } from '../auth/entities/Role.entity';
import { UserRole } from '../auth/entities/UserRole.entity';
import { UserSession } from '../auth/entities/UserSession.entity';
import {
  AuditEventType,
  RecordStatus,
} from '../../common/enums/database.enums';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { hashPassword } from '../../common/security/password.util';
import { PasswordSetupService } from '../auth/password-setup.service';
import { PasswordSetupEmailStatus } from '../auth/password-setup-email-status.enum';
import {
  assertCanManageAccountAction,
  assertCanCreateUser,
  assertCanUpdateUser,
} from './user-management.policy';
import {
  AccountStatusActionDto,
  AccountStatusActionResponseDto,
  PasswordResetResponseDto,
} from './dto/account-action.dto';
import { AuditService } from '../audit/audit.service';
import { SmtpMailService } from '../auth/smtp-mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccountLockEmailStatus } from './dto/account-lock-email-status.enum';

type UserListRawRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  roleCode: string | null;
  roleName: string | null;
  accountStatus: UserAccountStatus;
  passwordSetupRequired: boolean;
  passwordSetupEmailStatus: PasswordSetupEmailStatus | null;
  passwordSetupEmailAttemptedAt: Date | string | null;
  accountLockEmailStatus: AccountLockEmailStatus | null;
};

const DISPLAY_ROLE_JOIN = `role.id = (
  SELECT ur.role_id
  FROM user_roles ur
  JOIN roles selected_role ON selected_role.id = ur.role_id
  WHERE ur.user_id = "user"."id"
  ORDER BY selected_role.code ASC
  LIMIT 1
)`;

@Injectable()
export class UserManagementService {
  private readonly logger = new Logger(UserManagementService.name);

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly passwordSetup: PasswordSetupService,
    private readonly audit: AuditService,
    private readonly mail: SmtpMailService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    dto: MutateUserDto,
    actor: { id: string; roleCode: string },
  ): Promise<CreateUserResponseDto> {
    assertCanCreateUser(actor.roleCode, dto.roleCode);
    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const role = await manager.getRepository(Role).findOne({
          where: { code: dto.roleCode },
        });
        if (!role) this.throwRoleNotFound();
        await this.assertEmailAvailable(
          dto.email,
          undefined,
          manager.getRepository(User),
        );
        const passwordHash = await hashPassword(
          randomBytes(32).toString('hex'),
        );
        const created = await manager.getRepository(User).save(
          manager.getRepository(User).create({
            fullName: dto.fullName,
            email: dto.email,
            phone: dto.phone,
            passwordHash,
            status: RecordStatus.ACTIVE,
            manuallyLockedAt: null,
            manuallyLockedBy: null,
            loginFailedCount: 0,
            lockoutUntil: null,
            mustChangePassword: true,
            authVersion: 1,
          }),
        );
        await manager.getRepository(UserRole).save(
          manager.getRepository(UserRole).create({
            userId: created.id,
            roleId: role!.id,
            assignedAt: new Date(),
            assignedBy: actor.id,
          }),
        );
        const invitation = await this.passwordSetup.issue(
          manager,
          created.id,
          actor.id,
        );
        return { user: created, roleName: role!.name, invitation };
      });
      this.deliverInBackground(result.invitation);
      return {
        user: this.toUserItem(
          result.user,
          dto.roleCode,
          result.roleName,
          PasswordSetupEmailStatus.PENDING,
        ),
        invitationStatus: 'pending',
      };
    } catch (error) {
      this.rethrowDuplicateEmail(error);
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: { id: string; roleCode: string },
  ): Promise<UpdateUserResponseDto> {
    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const userRepository = manager.getRepository(User);
        const user = await userRepository.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) this.throwUserNotFound();
        const currentRole = await this.currentRole(id, manager);
        const currentStatus = this.deriveAccountStatus(user);
        assertCanUpdateUser({
          actorId: actor.id,
          actorRole: actor.roleCode,
          targetId: id,
          currentRole: currentRole.code,
          nextRole: dto.roleCode,
          nextStatus: currentStatus,
        });
        await this.assertEmailAvailable(dto.email, id, userRepository);
        const role = await manager.getRepository(Role).findOne({
          where: { code: dto.roleCode },
        });
        if (!role) this.throwRoleNotFound();
        const previousEmail = user.email;
        const emailChanged = previousEmail !== dto.email;
        const securityChanged =
          emailChanged || currentRole.code !== dto.roleCode;
        Object.assign(user, {
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone,
          authVersion: securityChanged
            ? user.authVersion + 1
            : user.authVersion,
        });
        await userRepository.save(user);
        const invitation =
          emailChanged && user.mustChangePassword
            ? await this.passwordSetup.issue(manager, id, actor.id)
            : null;
        if (emailChanged && !user.mustChangePassword) {
          await this.passwordSetup.revokeActive(manager, id);
        }
        if (currentRole.code !== dto.roleCode) {
          await manager.getRepository(UserRole).delete({ userId: id });
          await manager.getRepository(UserRole).save(
            manager.getRepository(UserRole).create({
              userId: id,
              roleId: role!.id,
              assignedAt: new Date(),
              assignedBy: actor.id,
            }),
          );
        }
        if (securityChanged) {
          await manager
            .getRepository(UserSession)
            .update(
              { userId: id, revokedAt: IsNull() },
              { revokedAt: new Date(), revokeReason: 'account_updated' },
            );
        }
        return {
          item: this.toUserItem(
            user,
            dto.roleCode,
            role!.name,
            invitation ? PasswordSetupEmailStatus.PENDING : null,
          ),
          invitation,
        };
      });
      if (result.invitation) {
        this.deliverInBackground(result.invitation);
      }
      return {
        user: result.item,
        invitationStatus: result.invitation ? 'pending' : null,
      };
    } catch (error) {
      this.rethrowDuplicateEmail(error);
      throw error;
    }
  }

  async resendPasswordSetup(
    id: string,
    actor: { id: string; roleCode: string },
  ): Promise<{ invitationStatus: 'sent' | 'failed' }> {
    const invitation = await this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) this.throwUserNotFound();
      const currentRole = await this.currentRole(id, manager);
      assertCanUpdateUser({
        actorId: actor.id,
        actorRole: actor.roleCode,
        targetId: id,
        currentRole: currentRole.code,
        nextRole: currentRole.code,
        nextStatus: this.deriveAccountStatus(user),
      });
      return this.passwordSetup.issue(manager, id, actor.id);
    });
    return {
      invitationStatus: await this.passwordSetup.deliver(invitation),
    };
  }

  async updateAccountStatus(
    id: string,
    dto: AccountStatusActionDto,
    actor: { id: string; roleCode: string },
  ): Promise<AccountStatusActionResponseDto> {
    const reason = dto.reason?.trim();
    if (dto.accountStatus === UserAccountStatus.LOCKED && !reason) {
      throw new BadRequestException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Lý do là bắt buộc khi khóa tài khoản.',
      });
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const user = await userRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) this.throwUserNotFound();
      const role = await this.currentRole(id, manager);
      assertCanManageAccountAction({
        actorId: actor.id,
        actorRole: actor.roleCode,
        targetId: id,
        targetRole: role.code,
      });

      const previousStatus = this.deriveAccountStatus(user);
      if (previousStatus === UserAccountStatus.INACTIVE) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message:
            'Tài khoản vô hiệu hóa cũ chỉ được giữ để tra cứu và không thể thay đổi trạng thái.',
        });
      }
      const changesState =
        dto.accountStatus !== previousStatus ||
        (dto.accountStatus === UserAccountStatus.LOCKED &&
          !user.manuallyLockedAt) ||
        (dto.accountStatus === UserAccountStatus.ACTIVE &&
          (!!user.manuallyLockedAt ||
            !!user.lockoutUntil ||
            user.loginFailedCount > 0));
      const repeatsRestriction =
        dto.accountStatus === previousStatus &&
        dto.accountStatus === UserAccountStatus.LOCKED;

      if (!changesState && !repeatsRestriction) {
        return {
          response: { user: this.toUserItem(user, role.code, role.name) },
          accountRestrictionNotification: null,
        };
      }

      if (changesState) {
        const state = this.accountState(dto.accountStatus, actor.id);
        Object.assign(user, {
          status: state.status,
          manuallyLockedAt: state.manuallyLockedAt,
          manuallyLockedBy: state.manuallyLockedBy,
          lockoutUntil: null,
          loginFailedCount: 0,
          authVersion: user.authVersion + 1,
        });
        await userRepository.save(user);
        await this.revokeSessions(
          manager,
          id,
          this.accountSessionRevokeReason(dto.accountStatus),
        );
      }
      if (dto.accountStatus === UserAccountStatus.LOCKED) {
        await this.passwordSetup.revokeActive(manager, id);
      }
      await this.audit.recordUserChange(manager, {
        actorId: actor.id,
        actorRole: actor.roleCode,
        targetId: user.id,
        targetLabel: user.email,
        eventType: AuditEventType.STATUS_CHANGED,
        reason: this.accountStatusAuditReason(reason),
        changes: [
          {
            fieldName: 'accountStatus',
            oldValue: previousStatus,
            newValue: dto.accountStatus,
          },
        ],
      });

      const emailDelivery =
        dto.accountStatus === UserAccountStatus.LOCKED
          ? await this.notifications.createAccountLockedEmailDelivery(manager, {
              userId: user.id,
              reason: reason!,
            })
          : null;

      return {
        response: {
          user: this.toUserItem(
            user,
            role.code,
            role.name,
            null,
            emailDelivery ? AccountLockEmailStatus.PENDING : null,
          ),
        },
        accountRestrictionNotification: emailDelivery
          ? {
              userId: user.id,
              deliveryId: emailDelivery.deliveryId,
              email: user.email,
              fullName: user.fullName,
              reason: reason!,
            }
          : null,
      };
    });

    if (result.accountRestrictionNotification) {
      this.sendAccountRestrictionEmailInBackground(
        result.accountRestrictionNotification,
      );
    }
    return result.response;
  }

  async resetPassword(
    id: string,
    actor: { id: string; roleCode: string },
  ): Promise<PasswordResetResponseDto> {
    const result = await this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const user = await userRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) this.throwUserNotFound();
      const role = await this.currentRole(id, manager);
      assertCanManageAccountAction({
        actorId: actor.id,
        actorRole: actor.roleCode,
        targetId: id,
        targetRole: role.code,
      });
      if (user.mustChangePassword) {
        throw new BadRequestException({
          code: ErrorCode.BAD_REQUEST,
          message:
            'Người dùng đang chờ đặt mật khẩu. Hãy dùng thao tác gửi lại email.',
        });
      }

      user.passwordHash = await hashPassword(randomBytes(32).toString('hex'));
      user.mustChangePassword = true;
      user.authVersion += 1;
      await userRepository.save(user);
      await this.revokeSessions(manager, id, 'password_reset');
      await this.audit.recordUserChange(manager, {
        actorId: actor.id,
        actorRole: actor.roleCode,
        targetId: user.id,
        targetLabel: user.email,
        eventType: AuditEventType.UPDATED,
        reason: 'Quản trị viên yêu cầu đặt lại mật khẩu.',
        changes: [
          {
            fieldName: 'passwordSetupRequired',
            oldValue: false,
            newValue: true,
          },
        ],
      });
      const invitation = await this.passwordSetup.issue(manager, id, actor.id);
      return { user, role, invitation };
    });

    this.deliverInBackground(result.invitation);
    return {
      user: this.toUserItem(
        result.user,
        result.role.code,
        result.role.name,
        PasswordSetupEmailStatus.PENDING,
      ),
      invitationStatus: 'pending',
    };
  }

  async findAll(query: QueryUsersDto): Promise<UserListResponseDto> {
    const queryBuilder = this.users
      .createQueryBuilder('user')
      .leftJoin('roles', 'role', DISPLAY_ROLE_JOIN)
      .select([
        'user.id AS "id"',
        'user.fullName AS "fullName"',
        'user.email AS "email"',
        'user.phone AS "phone"',
        'role.code AS "roleCode"',
        'role.name AS "roleName"',
        'user.mustChangePassword AS "passwordSetupRequired"',
        `(SELECT setup_token.delivery_status
          FROM user_password_setup_tokens setup_token
          WHERE setup_token.user_id = "user"."id"
            AND setup_token.used_at IS NULL
            AND setup_token.revoked_at IS NULL
          LIMIT 1) AS "passwordSetupEmailStatus"`,
        `(SELECT setup_token.delivery_attempted_at
          FROM user_password_setup_tokens setup_token
          WHERE setup_token.user_id = "user"."id"
            AND setup_token.used_at IS NULL
            AND setup_token.revoked_at IS NULL
          LIMIT 1) AS "passwordSetupEmailAttemptedAt"`,
        `(SELECT account_delivery.status
          FROM notifications account_notification
          JOIN notification_catalog account_catalog
            ON account_catalog.id = account_notification.notification_catalog_id
          JOIN notification_deliveries account_delivery
            ON account_delivery.notification_id = account_notification.id
          WHERE account_notification.recipient_user_id = "user"."id"
            AND account_catalog.event_code = 'user.account_locked'
            AND account_delivery.channel = 'email'
          ORDER BY account_notification.created_at DESC, account_delivery.created_at DESC
          LIMIT 1) AS "accountLockEmailStatus"`,
        `CASE
          WHEN user.status = 'inactive' THEN 'inactive'
          WHEN user.manuallyLockedAt IS NOT NULL THEN 'locked'
          WHEN user.lockoutUntil > CURRENT_TIMESTAMP THEN 'locked'
          WHEN user.mustChangePassword = true THEN 'pending_setup'
          ELSE 'active'
        END AS "accountStatus"`,
      ]);

    if (query.search) {
      queryBuilder.andWhere(
        `(user.fullName ILIKE :search ESCAPE '\\'
          OR user.email ILIKE :search ESCAPE '\\'
          OR COALESCE(user.phone, '') ILIKE :search ESCAPE '\\')`,
        { search: `%${this.escapeLikePattern(query.search)}%` },
      );
    }

    if (query.role) {
      queryBuilder.andWhere(
        `EXISTS (
          SELECT 1
          FROM user_roles filter_user_role
          JOIN roles filter_role ON filter_role.id = filter_user_role.role_id
          WHERE filter_user_role.user_id = "user"."id" AND filter_role.code = :role
        )`,
        { role: query.role },
      );
    }

    this.applyStatusFilter(queryBuilder, query.status);

    const total = await queryBuilder.getCount();
    const rows = await queryBuilder
      .orderBy('user.fullName', 'ASC')
      .addOrderBy('user.email', 'ASC')
      .addOrderBy('user.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getRawMany<UserListRawRow>();

    return {
      data: rows.map((row) => this.toResponseItem(row)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  private applyStatusFilter(
    queryBuilder: ReturnType<Repository<User>['createQueryBuilder']>,
    status?: UserAccountStatus,
  ): void {
    if (status === UserAccountStatus.ACTIVE) {
      queryBuilder.andWhere(
        "user.status = 'active' AND user.mustChangePassword = false AND user.manuallyLockedAt IS NULL AND (user.lockoutUntil IS NULL OR user.lockoutUntil <= CURRENT_TIMESTAMP)",
      );
    } else if (status === UserAccountStatus.LOCKED) {
      queryBuilder.andWhere(
        "user.status = 'active' AND (user.manuallyLockedAt IS NOT NULL OR user.lockoutUntil > CURRENT_TIMESTAMP)",
      );
    } else if (status === UserAccountStatus.INACTIVE) {
      queryBuilder.andWhere("user.status = 'inactive'");
    } else if (status === UserAccountStatus.PENDING_SETUP) {
      queryBuilder.andWhere(
        "user.status = 'active' AND user.mustChangePassword = true AND user.manuallyLockedAt IS NULL AND (user.lockoutUntil IS NULL OR user.lockoutUntil <= CURRENT_TIMESTAMP)",
      );
    }
  }

  private toResponseItem(row: UserListRawRow): UserListItemResponseDto {
    return {
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      role:
        row.roleCode && row.roleName
          ? { code: row.roleCode, name: row.roleName }
          : null,
      accountStatus: row.accountStatus,
      passwordSetupRequired: row.passwordSetupRequired,
      passwordSetupEmailStatus: row.passwordSetupEmailStatus,
      passwordSetupEmailAttemptedAt: row.passwordSetupEmailAttemptedAt
        ? new Date(row.passwordSetupEmailAttemptedAt).toISOString()
        : null,
      accountLockEmailStatus: row.accountLockEmailStatus,
    };
  }

  private escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`);
  }

  private deliverInBackground(
    invitation: Awaited<ReturnType<PasswordSetupService['issue']>>,
  ): void {
    void this.passwordSetup.deliver(invitation);
  }

  private sendAccountRestrictionEmailInBackground(input: {
    userId: string;
    deliveryId: string;
    email: string;
    fullName: string;
    reason: string;
  }): void {
    const { userId, deliveryId, ...emailPayload } = input;
    void this.mail.sendAccountLockedEmail(emailPayload).then(
      async () => {
        try {
          await this.notifications.recordEmailDeliverySent(deliveryId);
        } catch {
          this.logger.error(
            `Account restriction sent status could not be saved for user ${userId}`,
          );
        }
      },
      async (error: unknown) => {
        try {
          await this.notifications.recordEmailDeliveryFailed(deliveryId, error);
        } catch {
          this.logger.error(
            `Account restriction failed status could not be saved for user ${userId}`,
          );
        }
      },
    );
  }

  private async revokeSessions(
    manager: DataSource['manager'],
    userId: string,
    revokeReason: string,
  ): Promise<void> {
    await manager
      .getRepository(UserSession)
      .update(
        { userId, revokedAt: IsNull() },
        { revokedAt: new Date(), revokeReason },
      );
  }

  private accountSessionRevokeReason(
    nextStatus: EditableUserAccountStatus,
  ): string {
    if (nextStatus === UserAccountStatus.LOCKED) return 'account_locked';
    return 'account_unlocked';
  }

  private accountStatusAuditReason(reason?: string): string {
    if (reason) return reason;
    return 'Quản trị viên mở khóa tài khoản.';
  }

  private accountState(status: EditableUserAccountStatus, actorId: string) {
    if (status === UserAccountStatus.LOCKED) {
      return {
        status: RecordStatus.ACTIVE,
        manuallyLockedAt: new Date(),
        manuallyLockedBy: actorId,
      };
    }
    return {
      status: RecordStatus.ACTIVE,
      manuallyLockedAt: null,
      manuallyLockedBy: null,
    };
  }

  private deriveStatus(user: User): UserAccountStatus {
    const accountStatus = this.deriveAccountStatus(user);
    if (accountStatus !== UserAccountStatus.ACTIVE) return accountStatus;
    if (user.mustChangePassword) return UserAccountStatus.PENDING_SETUP;
    return UserAccountStatus.ACTIVE;
  }

  private deriveAccountStatus(user: User): UserAccountStatus {
    if (user.status === RecordStatus.INACTIVE)
      return UserAccountStatus.INACTIVE;
    if (
      user.manuallyLockedAt ||
      (user.lockoutUntil && user.lockoutUntil.getTime() > Date.now())
    ) {
      return UserAccountStatus.LOCKED;
    }
    return UserAccountStatus.ACTIVE;
  }

  private toUserItem(
    user: User,
    roleCode: UserRoleCode,
    roleName: string,
    passwordSetupEmailStatus: PasswordSetupEmailStatus | null = null,
    accountLockEmailStatus: AccountLockEmailStatus | null = null,
  ): UserListItemResponseDto {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: { code: roleCode, name: roleName },
      accountStatus: this.deriveStatus(user),
      passwordSetupRequired: user.mustChangePassword,
      passwordSetupEmailStatus,
      passwordSetupEmailAttemptedAt: null,
      accountLockEmailStatus,
    };
  }

  private async currentRole(
    userId: string,
    manager: DataSource['manager'],
  ): Promise<{ code: UserRoleCode; name: string }> {
    const row = await manager
      .getRepository(Role)
      .createQueryBuilder('role')
      .innerJoin('user_roles', 'ur', 'ur.role_id = role.id')
      .where('ur.user_id = :userId', { userId })
      .select(['role.code AS "code"', 'role.name AS "name"'])
      .getRawOne<{ code: UserRoleCode; name: string }>();
    if (!row) this.throwRoleNotFound();
    return row;
  }

  private async assertEmailAvailable(
    email: string,
    exceptId?: string,
    repository = this.users,
  ) {
    const existing = await repository
      .createQueryBuilder('candidate')
      .where('lower(candidate.email) = lower(:email)', { email })
      .andWhere(exceptId ? 'candidate.id <> :exceptId' : '1 = 1', { exceptId })
      .getOne();
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'Email đã được sử dụng bởi người dùng khác.',
      });
    }
  }

  private rethrowDuplicateEmail(error: unknown): void {
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string; constraint?: string }).code ===
        '23505' &&
      ['uq_users_email', 'uq_users_email_ci'].includes(
        (error.driverError as { constraint?: string }).constraint ?? '',
      )
    ) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'Email đã được sử dụng bởi người dùng khác.',
      });
    }
  }

  private throwUserNotFound(): never {
    throw new NotFoundException({
      code: ErrorCode.USER_NOT_FOUND,
      message: 'Không tìm thấy người dùng.',
    });
  }

  private throwRoleNotFound(): never {
    throw new NotFoundException({
      code: ErrorCode.RESOURCE_NOT_FOUND,
      message: 'Không tìm thấy vai trò.',
    });
  }
}
