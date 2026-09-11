import { BadRequestException, GoneException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PasswordSetupService } from './password-setup.service';
import { UserPasswordSetupToken } from './entities/UserPasswordSetupToken.entity';
import { User } from './entities/User.entity';
import { SmtpMailService } from './smtp-mail.service';
import { RecordStatus } from '../../common/enums/database.enums';

function buildUser(): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'new.user@example.com',
    fullName: 'Người dùng mới',
    status: RecordStatus.ACTIVE,
    manuallyLockedAt: null,
    mustChangePassword: true,
  } as User;
}

function buildToken(overrides: Partial<UserPasswordSetupToken> = {}) {
  return {
    id: 'token-id',
    userId: buildUser().id,
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    createdBy: 'actor-id',
    createdAt: new Date(),
    ...overrides,
  } as UserPasswordSetupToken;
}

describe('PasswordSetupService', () => {
  let tokenRepository: jest.Mocked<Repository<UserPasswordSetupToken>>;
  let userRepository: jest.Mocked<Repository<User>>;
  let dataSource: jest.Mocked<DataSource>;
  let mail: jest.Mocked<SmtpMailService>;
  let manager: EntityManager;
  let service: PasswordSetupService;

  beforeEach(() => {
    tokenRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((value) => value as UserPasswordSetupToken),
      save: jest.fn(async (value) => value as UserPasswordSetupToken),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<UserPasswordSetupToken>>;
    userRepository = {
      findOne: jest.fn().mockResolvedValue(buildUser()),
      save: jest.fn(async (value) => value),
    } as unknown as jest.Mocked<Repository<User>>;
    manager = {
      getRepository: jest.fn((entity) =>
        entity === UserPasswordSetupToken ? tokenRepository : userRepository,
      ),
    } as unknown as EntityManager;
    dataSource = {
      transaction: jest.fn((run) => run(manager)),
    } as unknown as jest.Mocked<DataSource>;
    mail = {
      sendPasswordSetupEmail: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SmtpMailService>;
    service = new PasswordSetupService(tokenRepository, dataSource, mail);
  });

  it('stores only a token hash and sends the raw token by email', async () => {
    const user = buildUser();
    userRepository.findOne.mockResolvedValue(user);
    const invitation = await service.issue(manager, user.id, 'actor-id');
    await expect(service.deliver(invitation)).resolves.toBe('sent');

    const saved = tokenRepository.create.mock
      .calls[0][0] as UserPasswordSetupToken;
    const emailed = mail.sendPasswordSetupEmail.mock.calls[0][0];
    expect(saved.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.tokenHash).not.toBe(emailed.token);
    expect(saved.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      23 * 60 * 60 * 1000,
    );
  });

  it('reports failed without deleting the created account when SMTP fails', async () => {
    mail.sendPasswordSetupEmail.mockRejectedValue(
      new Error('smtp unavailable'),
    );
    const user = buildUser();
    const invitation = await service.issue(manager, user.id, 'actor-id');
    await expect(service.deliver(invitation)).resolves.toBe('failed');
  });

  it('marks a temporarily locked account as unavailable in the invitation', async () => {
    const user = Object.assign(buildUser(), {
      lockoutUntil: new Date(Date.now() + 60_000),
    });
    userRepository.findOne.mockResolvedValue(user);

    const invitation = await service.issue(manager, user.id, 'actor-id');
    await service.deliver(invitation);

    expect(mail.sendPasswordSetupEmail).toHaveBeenCalledWith(
      expect.objectContaining({ accountAvailable: false }),
    );
  });

  it.each([
    [null, BadRequestException],
    [buildToken({ usedAt: new Date() }), GoneException],
    [buildToken({ expiresAt: new Date(Date.now() - 1000) }), GoneException],
  ])('rejects an unusable token', async (token, errorType) => {
    tokenRepository.findOne.mockResolvedValue(token);
    await expect(service.validate('raw-token')).rejects.toBeInstanceOf(
      errorType,
    );
  });

  it('consumes the token and password change in one transaction', async () => {
    const setupToken = buildToken();
    tokenRepository.findOne.mockResolvedValue(setupToken);
    const pendingUser = buildUser();
    userRepository.findOne.mockResolvedValue(pendingUser);

    await service.complete('raw-token', 'a secure passphrase');

    expect(userRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(tokenRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(userRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ mustChangePassword: false }),
    );
    expect(setupToken.usedAt).toBeInstanceOf(Date);
  });

  it('rejects a second active token after another token completed setup', async () => {
    const setupToken = buildToken();
    tokenRepository.findOne.mockResolvedValue(setupToken);
    userRepository.findOne.mockResolvedValue(
      Object.assign(buildUser(), { mustChangePassword: false }),
    );

    await expect(
      service.complete('another-active-token', 'a secure passphrase'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userRepository.save).not.toHaveBeenCalled();
  });
});
