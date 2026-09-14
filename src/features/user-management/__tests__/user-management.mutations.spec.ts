import { DataSource, EntityManager, Repository } from 'typeorm';
import { UserManagementService } from '../user-management.service';
import { User } from '../../auth/entities/User.entity';
import { Role } from '../../auth/entities/Role.entity';
import { UserRole } from '../../auth/entities/UserRole.entity';
import { UserSession } from '../../auth/entities/UserSession.entity';
import { PasswordSetupService } from '../../auth/password-setup.service';
import { RecordStatus } from '../../../common/enums/database.enums';
import { UserRoleCode } from '../dto/query-users.dto';
import { UserAccountStatus } from '../dto/user-account-status.enum';

function user(overrides: Partial<User> = {}): User {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    fullName: 'Người dùng',
    email: 'old@example.com',
    phone: null,
    passwordHash: 'existing-hash',
    status: RecordStatus.ACTIVE,
    mustChangePassword: true,
    loginFailedCount: 0,
    lockoutUntil: null,
    manuallyLockedAt: null,
    manuallyLockedBy: null,
    authVersion: 1,
    ...overrides,
  } as User;
}

function emailQueryBuilder(existing: User | null = null) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(existing),
  };
}

describe('UserManagementService mutations', () => {
  const role = {
    id: 'role-id',
    code: UserRoleCode.NVKH,
    name: 'Nhân viên Kinh doanh',
  } as Role;
  let users: jest.Mocked<Repository<User>>;
  let dataSource: jest.Mocked<DataSource>;
  let passwordSetup: jest.Mocked<PasswordSetupService>;
  let revokeActiveSetupTokens: jest.Mock;

  beforeEach(() => {
    users = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;
    dataSource = {} as jest.Mocked<DataSource>;
    revokeActiveSetupTokens = jest.fn().mockResolvedValue(undefined);
    passwordSetup = {
      issue: jest.fn().mockImplementation(async (_manager, userId) => ({
        user: user({ id: userId }),
        token: 'raw-token',
      })),
      revokeActive: revokeActiveSetupTokens,
      deliver: jest.fn().mockResolvedValue('sent'),
      resend: jest.fn(),
    } as unknown as jest.Mocked<PasswordSetupService>;
  });

  it('issues an invitation and creates an account without waiting for SMTP delivery', async () => {
    const created = user({ email: 'new@example.com', passwordHash: '' });
    const userRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(emailQueryBuilder()),
      create: jest.fn((value) => Object.assign(created, value)),
      save: jest.fn(async (value) => value),
    } as unknown as jest.Mocked<Repository<User>>;
    const roleRepository = {
      findOne: jest.fn().mockResolvedValue(role),
    } as unknown as jest.Mocked<Repository<Role>>;
    const userRoleRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    } as unknown as jest.Mocked<Repository<UserRole>>;
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === User) return userRepository;
        if (entity === Role) return roleRepository;
        return userRoleRepository;
      }),
    } as unknown as EntityManager;
    dataSource.transaction = jest.fn(async (run) => run(manager)) as never;
    passwordSetup.deliver.mockReturnValue(new Promise(() => undefined));
    const service = new UserManagementService(users, dataSource, passwordSetup);

    const result = await service.create(
      {
        fullName: 'Người dùng mới',
        email: 'new@example.com',
        phone: null,
        roleCode: UserRoleCode.NVKH,
        accountStatus: UserAccountStatus.ACTIVE,
      },
      { id: 'actor-id', roleCode: UserRoleCode.IT },
    );

    expect(created.passwordHash).not.toBe('');
    expect(created.passwordHash).not.toContain('new@example.com');
    expect(created.mustChangePassword).toBe(true);
    expect(userRoleRepository.save).toHaveBeenCalledTimes(1);
    expect(passwordSetup.issue).toHaveBeenCalledWith(
      manager,
      created.id,
      'actor-id',
    );
    expect(passwordSetup.deliver).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'raw-token' }),
    );
    expect(result.invitationStatus).toBe('pending');
    expect(result.user.accountStatus).toBe(UserAccountStatus.PENDING_SETUP);
  });

  it('increments auth version, revokes sessions and queues setup on pending email change', async () => {
    const target = user();
    const roleQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        code: UserRoleCode.NVKH,
        name: role.name,
      }),
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(target),
      createQueryBuilder: jest.fn().mockReturnValue(emailQueryBuilder()),
      save: jest.fn(async (value) => value),
    } as unknown as jest.Mocked<Repository<User>>;
    const roleRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ ...role, code: UserRoleCode.TPKH }),
      createQueryBuilder: jest.fn().mockReturnValue(roleQueryBuilder),
    } as unknown as jest.Mocked<Repository<Role>>;
    const userRoleRepository = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    } as unknown as jest.Mocked<Repository<UserRole>>;
    const sessionRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<Repository<UserSession>>;
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === User) return userRepository;
        if (entity === Role) return roleRepository;
        if (entity === UserRole) return userRoleRepository;
        return sessionRepository;
      }),
    } as unknown as EntityManager;
    dataSource.transaction = jest.fn(async (run) => run(manager)) as never;
    const service = new UserManagementService(users, dataSource, passwordSetup);

    const result = await service.update(
      target.id,
      {
        fullName: 'Đã sửa',
        email: 'new-address@example.com',
        phone: null,
        roleCode: UserRoleCode.TPKH,
        accountStatus: UserAccountStatus.LOCKED,
      },
      { id: 'sa-id', roleCode: UserRoleCode.SA },
    );

    expect(target.authVersion).toBe(2);
    expect(target.manuallyLockedAt).toBeInstanceOf(Date);
    expect(sessionRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: target.id }),
      expect.objectContaining({ revokeReason: 'account_updated' }),
    );
    expect(passwordSetup.issue).toHaveBeenCalledWith(
      manager,
      target.id,
      'sa-id',
    );
    expect(passwordSetup.deliver).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'raw-token' }),
    );
    expect(result.invitationStatus).toBe('pending');
    expect(result.user.accountStatus).toBe(UserAccountStatus.LOCKED);
  });

  it('revokes old setup tokens when only a pending user email changes', async () => {
    const target = user();
    const roleQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        code: UserRoleCode.NVKH,
        name: role.name,
      }),
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(target),
      createQueryBuilder: jest.fn().mockReturnValue(emailQueryBuilder()),
      save: jest.fn(async (value) => value),
    } as unknown as jest.Mocked<Repository<User>>;
    const roleRepository = {
      findOne: jest.fn().mockResolvedValue(role),
      createQueryBuilder: jest.fn().mockReturnValue(roleQueryBuilder),
    } as unknown as jest.Mocked<Repository<Role>>;
    const sessionRepository = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    } as unknown as jest.Mocked<Repository<UserSession>>;
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === User) return userRepository;
        if (entity === Role) return roleRepository;
        return sessionRepository;
      }),
    } as unknown as EntityManager;
    dataSource.transaction = jest.fn(async (run) => run(manager)) as never;
    const service = new UserManagementService(users, dataSource, passwordSetup);

    const result = await service.update(
      target.id,
      {
        fullName: target.fullName,
        email: 'correct-owner@example.com',
        phone: target.phone,
        roleCode: UserRoleCode.NVKH,
        accountStatus: UserAccountStatus.ACTIVE,
      },
      { id: 'it-id', roleCode: UserRoleCode.IT },
    );

    expect(passwordSetup.issue).toHaveBeenCalledWith(
      manager,
      target.id,
      'it-id',
    );
    expect(revokeActiveSetupTokens).not.toHaveBeenCalled();
    expect(passwordSetup.deliver).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'raw-token' }),
    );
    expect(target.authVersion).toBe(2);
    expect(sessionRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: target.id }),
      expect.objectContaining({ revokeReason: 'account_updated' }),
    );
    expect(result.invitationStatus).toBe('pending');
  });

  it('revokes existing sessions when only an active user email changes', async () => {
    const target = user({ mustChangePassword: false });
    const roleQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        code: UserRoleCode.NVKH,
        name: role.name,
      }),
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(target),
      createQueryBuilder: jest.fn().mockReturnValue(emailQueryBuilder()),
      save: jest.fn(async (value) => value),
    } as unknown as jest.Mocked<Repository<User>>;
    const roleRepository = {
      findOne: jest.fn().mockResolvedValue(role),
      createQueryBuilder: jest.fn().mockReturnValue(roleQueryBuilder),
    } as unknown as jest.Mocked<Repository<Role>>;
    const sessionRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<Repository<UserSession>>;
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === User) return userRepository;
        if (entity === Role) return roleRepository;
        return sessionRepository;
      }),
    } as unknown as EntityManager;
    dataSource.transaction = jest.fn(async (run) => run(manager)) as never;
    const service = new UserManagementService(users, dataSource, passwordSetup);

    const result = await service.update(
      target.id,
      {
        fullName: target.fullName,
        email: 'new-login@example.com',
        phone: target.phone,
        roleCode: UserRoleCode.NVKH,
        accountStatus: UserAccountStatus.ACTIVE,
      },
      { id: 'it-id', roleCode: UserRoleCode.IT },
    );

    expect(target.authVersion).toBe(2);
    expect(sessionRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: target.id }),
      expect.objectContaining({ revokeReason: 'account_updated' }),
    );
    expect(revokeActiveSetupTokens).toHaveBeenCalledWith(manager, target.id);
    expect(result.invitationStatus).toBeNull();
  });
});
