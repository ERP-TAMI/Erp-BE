import {
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { RecordStatus } from '../../common/enums/database.enums';
import * as passwordUtil from '../../common/security/password.util';
import { User } from './entities/User.entity';
import { UserPasswordSetupToken } from './entities/UserPasswordSetupToken.entity';
import { UserSession } from './entities/UserSession.entity';
import { PasswordResetService } from './password-reset.service';
import { PasswordTokenPurpose } from './password-token-purpose.enum';
import { SmtpMailService } from './smtp-mail.service';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'user@tami.test',
    fullName: 'Người dùng',
    passwordHash: 'old-hash',
    status: RecordStatus.ACTIVE,
    mustChangePassword: false,
    manuallyLockedAt: null,
    lockoutUntil: null,
    loginFailedCount: 0,
    authVersion: 1,
    ...overrides,
  } as User;
}

function buildToken(
  overrides: Partial<UserPasswordSetupToken> = {},
): UserPasswordSetupToken {
  return {
    id: 'token-id',
    userId: buildUser().id,
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    revokedAt: null,
    createdBy: null,
    purpose: PasswordTokenPurpose.PASSWORD_RESET,
    createdAt: new Date(Date.now() - 120_000),
    ...overrides,
  } as UserPasswordSetupToken;
}

describe('PasswordResetService', () => {
  let tokenRepository: jest.Mocked<Repository<UserPasswordSetupToken>>;
  let userRepository: jest.Mocked<Repository<User>>;
  let sessionRepository: jest.Mocked<Repository<UserSession>>;
  let dataSource: jest.Mocked<DataSource>;
  let manager: EntityManager;
  let mail: jest.Mocked<SmtpMailService>;
  let service: PasswordResetService;

  beforeEach(() => {
    tokenRepository = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((value) => value as UserPasswordSetupToken),
      save: jest.fn(async (value) => value as UserPasswordSetupToken),
    } as unknown as jest.Mocked<Repository<UserPasswordSetupToken>>;
    userRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    } as unknown as jest.Mocked<Repository<User>>;
    sessionRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<Repository<UserSession>>;
    manager = {
      getRepository: jest.fn((entity) => {
        if (entity === User) return userRepository;
        if (entity === UserSession) return sessionRepository;
        return tokenRepository;
      }),
    } as unknown as EntityManager;
    dataSource = {
      transaction: jest.fn((run) => run(manager)),
      getRepository: jest.fn((entity) =>
        entity === User ? userRepository : tokenRepository,
      ),
    } as unknown as jest.Mocked<DataSource>;
    mail = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SmtpMailService>;
    service = new PasswordResetService(tokenRepository, dataSource, mail);
    jest.spyOn(passwordUtil, 'hashPassword').mockResolvedValue('new-hash');
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns an explicit error when the email does not exist', async () => {
    userRepository.findOne.mockResolvedValue(null);

    await expect(service.request('missing@tami.test')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([
    buildUser({ status: RecordStatus.INACTIVE }),
    buildUser({ mustChangePassword: true }),
    buildUser({ manuallyLockedAt: new Date() }),
    buildUser({ lockoutUntil: new Date(Date.now() + 60_000) }),
  ])('does not issue a token for an unavailable account', async (user) => {
    userRepository.findOne.mockResolvedValue(user);

    await expect(service.request(user.email)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tokenRepository.save).not.toHaveBeenCalled();
  });

  it('issues a hashed password-reset token and revokes the previous active token', async () => {
    userRepository.findOne.mockResolvedValue(buildUser());
    tokenRepository.findOne.mockResolvedValue(null);

    const reset = await service.request('  USER@TAMI.TEST ');

    expect(userRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'user@tami.test' } }),
    );
    expect(tokenRepository.update).toHaveBeenCalled();
    const created = tokenRepository.create.mock.calls[0][0];
    expect(created).toEqual(
      expect.objectContaining({
        purpose: PasswordTokenPurpose.PASSWORD_RESET,
        createdBy: null,
        deliveryStatus: 'pending',
      }),
    );
    expect(created.tokenHash).not.toBe(reset.token);
  });

  it('records failed SMTP delivery without exposing the raw error to callers', async () => {
    mail.sendPasswordResetEmail.mockRejectedValue(
      new Error('SMTP password secret'),
    );

    await expect(
      service.deliver({ user: buildUser(), token: 'raw-token' }),
    ).resolves.toBeUndefined();

    expect(tokenRepository.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ deliveryStatus: 'failed' }),
    );
  });

  it('rejects expired reset links', async () => {
    tokenRepository.findOne.mockResolvedValue(
      buildToken({ expiresAt: new Date(Date.now() - 1) }),
    );

    await expect(service.validate('expired')).rejects.toBeInstanceOf(
      GoneException,
    );
  });

  it('changes the password and revokes existing sessions atomically', async () => {
    const user = buildUser({ loginFailedCount: 3, authVersion: 7 });
    const token = buildToken();
    tokenRepository.findOne.mockResolvedValue(token);
    userRepository.findOne.mockResolvedValue(user);

    await service.complete('raw-token', 'new-password');

    expect(userRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash: 'new-hash',
        authVersion: 8,
        loginFailedCount: 0,
        lockoutUntil: null,
      }),
    );
    expect(sessionRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id }),
      expect.objectContaining({ revokeReason: 'password_reset' }),
    );
    expect(tokenRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ usedAt: expect.any(Date) }),
    );
  });
});
