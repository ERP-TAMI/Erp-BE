import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  AuditEventType,
  RecordStatus,
} from '../../common/enums/database.enums';
import { ErrorCode } from '../../common/enums/error-code.enum';
import * as passwordUtil from '../../common/security/password.util';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { User } from './entities/User.entity';
import { PasswordSetupService } from './password-setup.service';
import { ProfileService } from './profile.service';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@tami.test',
    passwordHash: 'current-hash',
    fullName: 'Nguyễn Văn A',
    phone: '0901234567',
    avatarUrl: null,
    status: RecordStatus.ACTIVE,
    mustChangePassword: false,
    loginFailedCount: 0,
    lockoutUntil: null,
    manuallyLockedAt: null,
    manuallyLockedBy: null,
    authVersion: 3,
    lastLoginAt: null,
    rowVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

describe('ProfileService', () => {
  let users: jest.Mocked<Repository<User>>;
  let dataSource: jest.Mocked<DataSource>;
  let audit: jest.Mocked<AuditService>;
  let passwordSetup: jest.Mocked<PasswordSetupService>;
  let auth: jest.Mocked<AuthService>;
  let service: ProfileService;

  beforeEach(() => {
    users = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    } as unknown as jest.Mocked<Repository<User>>;
    const manager = {
      getRepository: jest.fn(() => users),
    } as unknown as EntityManager;
    dataSource = {
      transaction: jest.fn((run) => run(manager)),
    } as unknown as jest.Mocked<DataSource>;
    audit = {
      recordUserChange: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    passwordSetup = {
      revokeActive: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PasswordSetupService>;
    auth = {
      getMe: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@tami.test',
        fullName: 'Nguyễn Văn B',
        phone: null,
        roleCode: 'NVKH',
        roleName: 'Nhân viên kinh doanh',
        permissions: [],
      }),
    } as unknown as jest.Mocked<AuthService>;

    service = new ProfileService(dataSource, audit, passwordSetup, auth);
    jest.spyOn(passwordUtil, 'verifyPassword');
    jest.spyOn(passwordUtil, 'hashPassword');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('updates only the current user profile fields and records their changes', async () => {
    const user = buildUser();
    users.findOne.mockResolvedValue(user);

    const result = await service.updateProfile(
      { fullName: 'Nguyễn Văn B', phone: null },
      { id: user.id, roleCode: 'NVKH' },
    );

    expect(user).toMatchObject({
      fullName: 'Nguyễn Văn B',
      phone: null,
      email: 'user@tami.test',
      status: RecordStatus.ACTIVE,
      authVersion: 3,
    });
    expect(audit.recordUserChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: user.id,
        targetId: user.id,
        eventType: AuditEventType.UPDATED,
        changes: [
          {
            fieldName: 'fullName',
            oldValue: 'Nguyễn Văn A',
            newValue: 'Nguyễn Văn B',
          },
          { fieldName: 'phone', oldValue: '0901234567', newValue: null },
        ],
      }),
    );
    expect(result.fullName).toBe('Nguyễn Văn B');
  });

  it('preserves the phone number when an API client omits the optional field', async () => {
    const user = buildUser();
    users.findOne.mockResolvedValue(user);

    await service.updateProfile(
      { fullName: 'Nguyễn Văn B' },
      { id: user.id, roleCode: 'NVKH' },
    );

    expect(user.phone).toBe('0901234567');
    expect(audit.recordUserChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        changes: [
          {
            fieldName: 'fullName',
            oldValue: 'Nguyễn Văn A',
            newValue: 'Nguyễn Văn B',
          },
        ],
      }),
    );
  });

  it('rejects an incorrect current password without changing persisted data', async () => {
    const user = buildUser();
    users.findOne.mockResolvedValue(user);
    jest.spyOn(passwordUtil, 'verifyPassword').mockResolvedValue(false);

    await expect(
      service.changePassword(
        { currentPassword: 'wrong-password', newPassword: 'new-password' },
        { id: user.id, roleCode: 'NVKH' },
      ),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.CURRENT_PASSWORD_INCORRECT },
    });

    expect(users.save).not.toHaveBeenCalled();
    expect(passwordSetup.revokeActive).not.toHaveBeenCalled();
    expect(audit.recordUserChange).not.toHaveBeenCalled();
  });

  it('rejects reusing the current password', async () => {
    const user = buildUser();
    users.findOne.mockResolvedValue(user);
    jest.spyOn(passwordUtil, 'verifyPassword').mockResolvedValue(true);

    await expect(
      service.changePassword(
        {
          currentPassword: 'current-password',
          newPassword: 'current-password',
        },
        { id: user.id, roleCode: 'NVKH' },
      ),
    ).rejects.toMatchObject({
      response: { code: ErrorCode.PASSWORD_REUSE_NOT_ALLOWED },
    });
  });

  it('changes the password without revoking the current session and revokes old reset links', async () => {
    const user = buildUser();
    users.findOne.mockResolvedValue(user);
    jest
      .spyOn(passwordUtil, 'verifyPassword')
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    jest.spyOn(passwordUtil, 'hashPassword').mockResolvedValue('new-hash');

    await service.changePassword(
      { currentPassword: 'current-password', newPassword: 'new-password' },
      { id: user.id, roleCode: 'NVKH' },
    );

    expect(user.passwordHash).toBe('new-hash');
    expect(user.authVersion).toBe(3);
    expect(passwordSetup.revokeActive).toHaveBeenCalledWith(
      expect.anything(),
      user.id,
    );
    expect(audit.recordUserChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: AuditEventType.PASSWORD_CHANGED,
        changes: [],
      }),
    );
  });
});
