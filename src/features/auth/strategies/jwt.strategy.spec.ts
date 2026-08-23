import { UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../entities/User.entity';
import { RecordStatus } from '../../../common/enums/database.enums';
import { JwtPayload } from '../jwt-payload.type';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'sa@tami.test',
    status: RecordStatus.ACTIVE,
    lockoutUntil: null,
    ...overrides,
  } as User;
}

describe('JwtStrategy', () => {
  let userRepository: jest.Mocked<Repository<User>>;
  let strategy: JwtStrategy;

  const payload: JwtPayload = {
    sub: 'user-1',
    email: 'sa@tami.test',
    roleCode: 'SA',
    permissions: ['system.users.manage'],
  };

  beforeEach(() => {
    userRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;
    strategy = new JwtStrategy(userRepository);
  });

  it('rejects when the user id from the token no longer exists', async () => {
    userRepository.findOne.mockResolvedValue(null);
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an inactive account even with a validly signed token', async () => {
    userRepository.findOne.mockResolvedValue(
      buildUser({ status: RecordStatus.INACTIVE }),
    );
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an account currently locked out', async () => {
    userRepository.findOne.mockResolvedValue(
      buildUser({ lockoutUntil: new Date(Date.now() + 60_000) }),
    );
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the request user for an active, unlocked account', async () => {
    userRepository.findOne.mockResolvedValue(buildUser());

    await expect(strategy.validate(payload)).resolves.toEqual({
      id: 'user-1',
      email: 'sa@tami.test',
      roleCode: 'SA',
      permissions: ['system.users.manage'],
    });
  });
});
