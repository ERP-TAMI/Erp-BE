import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { User } from './entities/User.entity';
import { UserSession } from './entities/UserSession.entity';
import { RecordStatus } from '../../common/enums/database.enums';
import { ErrorCode } from '../../common/enums/error-code.enum';
import * as passwordUtil from '../../common/security/password.util';
import { LOGIN_FAILED_THRESHOLD } from './auth.constants';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'sa@tami.test',
    passwordHash: 'hashed',
    fullName: 'Quản trị hệ thống',
    phone: null,
    avatarUrl: null,
    status: RecordStatus.ACTIVE,
    mustChangePassword: false,
    loginFailedCount: 0,
    lockoutUntil: null,
    lastLoginAt: null,
    rowVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

function buildSession(overrides: Partial<UserSession> = {}): UserSession {
  return {
    id: 'session-1',
    userId: 'user-1',
    refreshTokenHash: 'hash-of-old-token',
    userAgent: null,
    ipAddress: null,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    revokeReason: null,
    createdAt: new Date(),
    ...overrides,
  } as UserSession;
}

describe('AuthService', () => {
  let userRepository: jest.Mocked<Repository<User>>;
  let sessionRepository: jest.Mocked<Repository<UserSession>>;
  let dataSource: jest.Mocked<DataSource>;
  let jwtService: { sign: jest.Mock };
  let service: AuthService;

  const roleInfoRow = [
    { role_code: 'SA', role_name: 'Quản trị hệ thống', permissions: ['a.b'] },
  ];

  beforeEach(() => {
    userRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;
    sessionRepository = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<UserSession>>;
    dataSource = {
      query: jest.fn().mockResolvedValue(roleInfoRow),
    } as unknown as jest.Mocked<DataSource>;
    jwtService = { sign: jest.fn().mockReturnValue('signed.access.token') };

    service = new AuthService(
      userRepository,
      sessionRepository,
      dataSource,
      jwtService as never,
    );

    jest.spyOn(passwordUtil, 'verifyPassword');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('login', () => {
    it('rejects an unknown email with a generic invalid-credentials error', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.login('missing@tami.test', 'x', {}),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.INVALID_CREDENTIALS },
      });
    });

    it('rejects a wrong password and increments the failed-login counter', async () => {
      const user = buildUser({ loginFailedCount: 1 });
      userRepository.findOne.mockResolvedValue(user);
      jest.spyOn(passwordUtil, 'verifyPassword').mockResolvedValue(false);

      await expect(
        service.login(user.email, 'wrong', {}),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.INVALID_CREDENTIALS },
      });

      expect(userRepository.update).toHaveBeenCalledWith(user.id, {
        loginFailedCount: 2,
      });
    });

    it('locks the account once the failed-login threshold is reached', async () => {
      const user = buildUser({ loginFailedCount: LOGIN_FAILED_THRESHOLD - 1 });
      userRepository.findOne.mockResolvedValue(user);
      jest.spyOn(passwordUtil, 'verifyPassword').mockResolvedValue(false);

      await expect(service.login(user.email, 'wrong', {})).rejects.toThrow();

      const patch = userRepository.update.mock.calls[0][1] as {
        loginFailedCount: number;
        lockoutUntil: Date;
      };
      expect(patch.loginFailedCount).toBe(LOGIN_FAILED_THRESHOLD);
      expect(patch.lockoutUntil.getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects a locked account with ACCOUNT_LOCKED, even before checking the password', async () => {
      const user = buildUser({
        lockoutUntil: new Date(Date.now() + 60_000),
      });
      userRepository.findOne.mockResolvedValue(user);
      const verifySpy = jest.spyOn(passwordUtil, 'verifyPassword');

      await expect(
        service.login(user.email, 'whatever', {}),
      ).rejects.toMatchObject({ response: { code: ErrorCode.ACCOUNT_LOCKED } });
      expect(verifySpy).not.toHaveBeenCalled();
    });

    it('rejects an inactive account with ACCOUNT_INACTIVE', async () => {
      const user = buildUser({ status: RecordStatus.INACTIVE });
      userRepository.findOne.mockResolvedValue(user);

      await expect(
        service.login(user.email, 'whatever', {}),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.ACCOUNT_INACTIVE },
      });
    });

    it('issues an access token and a session on success, and resets the failed-login counter', async () => {
      const user = buildUser({ loginFailedCount: 3 });
      userRepository.findOne.mockResolvedValue(user);
      jest.spyOn(passwordUtil, 'verifyPassword').mockResolvedValue(true);

      const result = await service.login(user.email, 'correct', {});

      expect(result.accessToken).toBe('signed.access.token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken.length).toBeGreaterThan(0);
      expect(result.user).toMatchObject({
        id: user.id,
        roleCode: 'SA',
        permissions: ['a.b'],
      });
      expect(userRepository.update).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({ loginFailedCount: 0, lockoutUntil: null }),
      );
      expect(sessionRepository.save).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('rejects when no refresh token is provided', async () => {
      await expect(service.refresh(undefined, {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an unknown, revoked, or expired session', async () => {
      sessionRepository.findOne.mockResolvedValueOnce(null);
      await expect(
        service.refresh('raw-token', {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      sessionRepository.findOne.mockResolvedValueOnce(
        buildSession({ revokedAt: new Date() }),
      );
      await expect(
        service.refresh('raw-token', {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      sessionRepository.findOne.mockResolvedValueOnce(
        buildSession({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(
        service.refresh('raw-token', {}),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rotates a valid session: revokes the old one and issues a new token pair', async () => {
      const session = buildSession();
      sessionRepository.findOne.mockResolvedValue(session);
      userRepository.findOne.mockResolvedValue(buildUser());

      const result = await service.refresh('raw-token', {});

      expect(sessionRepository.update).toHaveBeenCalledWith(
        session.id,
        expect.objectContaining({ revokeReason: 'rotated' }),
      );
      expect(result.accessToken).toBe('signed.access.token');
      expect(sessionRepository.save).toHaveBeenCalled();
    });

    it('rejects refresh for a now-locked account', async () => {
      sessionRepository.findOne.mockResolvedValue(buildSession());
      userRepository.findOne.mockResolvedValue(
        buildUser({ lockoutUntil: new Date(Date.now() + 60_000) }),
      );

      await expect(
        service.refresh('raw-token', {}),
      ).rejects.toMatchObject({ response: { code: ErrorCode.ACCOUNT_LOCKED } });
    });
  });

  describe('logout', () => {
    it('is a no-op when there is no token', async () => {
      await service.logout(undefined);
      expect(sessionRepository.update).not.toHaveBeenCalled();
    });

    it('revokes the matching session', async () => {
      const session = buildSession();
      sessionRepository.findOne.mockResolvedValue(session);

      await service.logout('raw-token');

      expect(sessionRepository.update).toHaveBeenCalledWith(
        session.id,
        expect.objectContaining({ revokeReason: 'logout' }),
      );
    });

    it('is idempotent when the session is already revoked', async () => {
      sessionRepository.findOne.mockResolvedValue(
        buildSession({ revokedAt: new Date() }),
      );

      await service.logout('raw-token');

      expect(sessionRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('getMe', () => {
    it('rejects when the user no longer exists', async () => {
      userRepository.findOne.mockResolvedValue(null);
      await expect(service.getMe('user-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects when the user has no assigned role', async () => {
      userRepository.findOne.mockResolvedValue(buildUser());
      dataSource.query.mockResolvedValueOnce([]);

      await expect(service.getMe('user-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns fresh user + role + permissions', async () => {
      userRepository.findOne.mockResolvedValue(buildUser());

      await expect(service.getMe('user-1')).resolves.toMatchObject({
        roleCode: 'SA',
        permissions: ['a.b'],
      });
    });
  });
});
