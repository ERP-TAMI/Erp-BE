import { DataSource, EntityManager, Repository } from 'typeorm';
import { UserManagementService } from '../user-management.service';
import { User } from '../../auth/entities/User.entity';
import { Role } from '../../auth/entities/Role.entity';
import { UserSession } from '../../auth/entities/UserSession.entity';
import { PasswordSetupService } from '../../auth/password-setup.service';
import { AuditService } from '../../audit/audit.service';
import { SmtpMailService } from '../../auth/smtp-mail.service';
import {
  NotificationDeliveryStatus,
  RecordStatus,
} from '../../../common/enums/database.enums';
import { NotificationsService } from '../../notifications/notifications.service';
import { UserRoleCode } from '../dto/query-users.dto';
import { UserAccountStatus } from '../dto/user-account-status.enum';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    fullName: 'Người dùng',
    email: 'target@example.com',
    phone: null,
    passwordHash: 'existing-hash',
    status: RecordStatus.ACTIVE,
    mustChangePassword: false,
    loginFailedCount: 4,
    lockoutUntil: new Date(Date.now() + 60_000),
    manuallyLockedAt: null,
    manuallyLockedBy: null,
    authVersion: 1,
    ...overrides,
  } as User;
}

function roleQueryBuilder() {
  return {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({
      code: UserRoleCode.NVKH,
      name: 'Nhân viên Kế hoạch',
    }),
  };
}

describe('UserManagementService account actions', () => {
  let target: User;
  let userRepository: jest.Mocked<Repository<User>>;
  let sessionRepository: jest.Mocked<Repository<UserSession>>;
  let manager: EntityManager;
  let dataSource: jest.Mocked<DataSource>;
  let passwordSetup: jest.Mocked<PasswordSetupService>;
  let audit: jest.Mocked<AuditService>;
  let mail: jest.Mocked<SmtpMailService>;
  let notifications: jest.Mocked<NotificationsService>;
  let service: UserManagementService;

  beforeEach(() => {
    target = buildUser();
    userRepository = {
      findOne: jest.fn().mockResolvedValue(target),
      save: jest.fn(async (value) => value),
    } as unknown as jest.Mocked<Repository<User>>;
    sessionRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<Repository<UserSession>>;
    const roleRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(roleQueryBuilder()),
    } as unknown as jest.Mocked<Repository<Role>>;
    manager = {
      getRepository: jest.fn((entity) => {
        if (entity === User) return userRepository;
        if (entity === Role) return roleRepository;
        return sessionRepository;
      }),
    } as unknown as EntityManager;
    dataSource = {
      transaction: jest.fn(async (run) => run(manager)),
    } as unknown as jest.Mocked<DataSource>;
    passwordSetup = {
      issue: jest.fn().mockResolvedValue({ user: target, token: 'raw-token' }),
      deliver: jest.fn().mockResolvedValue('sent'),
      revokeActive: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PasswordSetupService>;
    audit = {
      recordUserChange: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    mail = {
      sendAccountLockedEmail: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SmtpMailService>;
    notifications = {
      createAccountLockedEmailDelivery: jest
        .fn()
        .mockResolvedValue({ deliveryId: 'delivery-id' }),
      recordEmailDeliverySent: jest.fn().mockResolvedValue(undefined),
      recordEmailDeliveryFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationsService>;
    service = new UserManagementService(
      {} as Repository<User>,
      dataSource,
      passwordSetup,
      audit,
      mail,
      notifications,
    );
  });

  it('locks an account with a reason and revokes its existing sessions', async () => {
    const result = await service.updateAccountStatus(
      target.id,
      { accountStatus: UserAccountStatus.LOCKED, reason: 'Vi phạm chính sách' },
      { id: 'it-actor', roleCode: UserRoleCode.IT },
    );

    expect(target.status).toBe(RecordStatus.ACTIVE);
    expect(target.manuallyLockedAt).toBeInstanceOf(Date);
    expect(target.manuallyLockedBy).toBe('it-actor');
    expect(target.lockoutUntil).toBeNull();
    expect(target.loginFailedCount).toBe(0);
    expect(target.authVersion).toBe(2);
    expect(sessionRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: target.id }),
      expect.objectContaining({ revokeReason: 'account_locked' }),
    );
    expect(passwordSetup.revokeActive).toHaveBeenCalledWith(manager, target.id);
    expect(notifications.createAccountLockedEmailDelivery).toHaveBeenCalledWith(
      manager,
      { userId: target.id, reason: 'Vi phạm chính sách' },
    );
    expect(audit.recordUserChange).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        reason: 'Vi phạm chính sách',
        changes: [
          expect.objectContaining({ oldValue: 'locked', newValue: 'locked' }),
        ],
      }),
    );
    expect(result.user.accountStatus).toBe(UserAccountStatus.LOCKED);
    expect(mail.sendAccountLockedEmail).toHaveBeenCalledWith({
      email: target.email,
      fullName: target.fullName,
      reason: 'Vi phạm chính sách',
    });
    await Promise.resolve();
    expect(notifications.recordEmailDeliverySent).toHaveBeenCalledWith(
      'delivery-id',
    );
    expect(result.user.accountLockEmailStatus).toBe(
      NotificationDeliveryStatus.PENDING,
    );
  });

  it('does not wait for SMTP before returning a successful manual lock', async () => {
    target.lockoutUntil = null;
    mail.sendAccountLockedEmail.mockReturnValue(new Promise(() => undefined));

    const result = await service.updateAccountStatus(
      target.id,
      { accountStatus: UserAccountStatus.LOCKED, reason: 'Khóa khẩn cấp' },
      { id: 'it-actor', roleCode: UserRoleCode.IT },
    );

    expect(result.user.accountStatus).toBe(UserAccountStatus.LOCKED);
    expect(mail.sendAccountLockedEmail).toHaveBeenCalledTimes(1);
  });

  it('records and emails a new reason when an already locked account is locked again', async () => {
    Object.assign(target, {
      manuallyLockedAt: new Date(),
      manuallyLockedBy: 'old-actor',
      lockoutUntil: null,
      loginFailedCount: 0,
    });

    const result = await service.updateAccountStatus(
      target.id,
      {
        accountStatus: UserAccountStatus.LOCKED,
        reason: 'Bổ sung kết quả điều tra',
      },
      { id: 'it-actor', roleCode: UserRoleCode.IT },
    );

    expect(userRepository.save).not.toHaveBeenCalled();
    expect(sessionRepository.update).not.toHaveBeenCalled();
    expect(audit.recordUserChange).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ reason: 'Bổ sung kết quả điều tra' }),
    );
    expect(mail.sendAccountLockedEmail).toHaveBeenCalledWith({
      email: target.email,
      fullName: target.fullName,
      reason: 'Bổ sung kết quả điều tra',
    });
    expect(passwordSetup.revokeActive).toHaveBeenCalledWith(manager, target.id);
    expect(result.user.accountStatus).toBe(UserAccountStatus.LOCKED);
  });

  it('records a failed lock email delivery without failing the lock request', async () => {
    target.lockoutUntil = null;
    const smtpError = Object.assign(new Error('secret SMTP details'), {
      code: 'ETIMEDOUT',
    });
    mail.sendAccountLockedEmail.mockRejectedValue(smtpError);

    await expect(
      service.updateAccountStatus(
        target.id,
        { accountStatus: UserAccountStatus.LOCKED, reason: 'Khóa khẩn cấp' },
        { id: 'it-actor', roleCode: UserRoleCode.IT },
      ),
    ).resolves.toBeDefined();
    await Promise.resolve();
    await Promise.resolve();

    expect(notifications.recordEmailDeliveryFailed).toHaveBeenCalledWith(
      'delivery-id',
      smtpError,
    );
  });

  it('activates a locked account without reviving old sessions and records a valid audit reason', async () => {
    Object.assign(target, { manuallyLockedAt: new Date() });

    const result = await service.updateAccountStatus(
      target.id,
      { accountStatus: UserAccountStatus.ACTIVE },
      { id: 'sa-actor', roleCode: UserRoleCode.SA },
    );

    expect(target.status).toBe(RecordStatus.ACTIVE);
    expect(target.manuallyLockedAt).toBeNull();
    expect(target.lockoutUntil).toBeNull();
    expect(target.loginFailedCount).toBe(0);
    expect(target.authVersion).toBe(2);
    expect(sessionRepository.update).toHaveBeenCalledTimes(1);
    expect(audit.recordUserChange).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        reason: expect.any(String),
      }),
    );
    expect(
      audit.recordUserChange.mock.calls[0][1].reason?.trim().length,
    ).toBeGreaterThan(0);
    expect(result.user.accountStatus).toBe(UserAccountStatus.ACTIVE);
  });

  it.each([UserAccountStatus.ACTIVE, UserAccountStatus.LOCKED] as const)(
    'keeps a legacy inactive account read-only when requesting %s',
    async (nextStatus) => {
      target.status = RecordStatus.INACTIVE;

      await expect(
        service.updateAccountStatus(
          target.id,
          {
            accountStatus: nextStatus,
            reason:
              nextStatus === UserAccountStatus.LOCKED
                ? 'Yêu cầu khóa'
                : undefined,
          },
          { id: 'sa-actor', roleCode: UserRoleCode.SA },
        ),
      ).rejects.toMatchObject({ status: 409 });

      expect(target.status).toBe(RecordStatus.INACTIVE);
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(sessionRepository.update).not.toHaveBeenCalled();
      expect(audit.recordUserChange).not.toHaveBeenCalled();
    },
  );

  it('treats an already active clean account as an idempotent no-op', async () => {
    Object.assign(target, {
      loginFailedCount: 0,
      lockoutUntil: null,
      manuallyLockedAt: null,
      manuallyLockedBy: null,
    });

    const result = await service.updateAccountStatus(
      target.id,
      { accountStatus: UserAccountStatus.ACTIVE },
      { id: 'sa-actor', roleCode: UserRoleCode.SA },
    );

    expect(userRepository.save).not.toHaveBeenCalled();
    expect(sessionRepository.update).not.toHaveBeenCalled();
    expect(audit.recordUserChange).not.toHaveBeenCalled();
    expect(result.user.accountStatus).toBe(UserAccountStatus.ACTIVE);
  });

  it('resets password immediately, revokes sessions and queues one setup email', async () => {
    target.lockoutUntil = null;
    passwordSetup.deliver.mockReturnValue(new Promise(() => undefined));

    const result = await service.resetPassword(target.id, {
      id: 'sa-actor',
      roleCode: UserRoleCode.SA,
    });

    expect(target.passwordHash).not.toBe('existing-hash');
    expect(target.mustChangePassword).toBe(true);
    expect(target.authVersion).toBe(2);
    expect(sessionRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: target.id }),
      expect.objectContaining({ revokeReason: 'password_reset' }),
    );
    expect(passwordSetup.issue).toHaveBeenCalledWith(
      manager,
      target.id,
      'sa-actor',
    );
    expect(passwordSetup.deliver).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'raw-token' }),
    );
    expect(result.invitationStatus).toBe('pending');
    expect(result.user.accountStatus).toBe(UserAccountStatus.PENDING_SETUP);
  });
});
