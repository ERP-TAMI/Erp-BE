import { ForbiddenException } from '@nestjs/common';
import { UserRoleCode } from './dto/query-users.dto';
import { UserAccountStatus } from './dto/user-account-status.enum';
import {
  assertCanCreateUser,
  assertCanUpdateUser,
} from './user-management.policy';

describe('user management policy', () => {
  it.each(Object.values(UserRoleCode))('allows SA to create %s', (role) => {
    expect(() => assertCanCreateUser('SA', role)).not.toThrow();
  });

  it.each([
    UserRoleCode.TPKH,
    UserRoleCode.NVKH,
    UserRoleCode.RD,
    UserRoleCode.ACCOUNTING,
  ])('allows IT to create %s', (role) => {
    expect(() => assertCanCreateUser('IT', role)).not.toThrow();
  });

  it.each([UserRoleCode.SA, UserRoleCode.IT])(
    'blocks IT from creating %s',
    (role) => {
      expect(() => assertCanCreateUser('IT', role)).toThrow(ForbiddenException);
    },
  );

  it('allows a user to update only their own profile fields', () => {
    expect(() =>
      assertCanUpdateUser({
        actorId: 'self',
        actorRole: 'IT',
        targetId: 'self',
        currentRole: UserRoleCode.IT,
        nextRole: UserRoleCode.IT,
        nextStatus: UserAccountStatus.ACTIVE,
      }),
    ).not.toThrow();
  });

  it.each([UserAccountStatus.LOCKED, UserAccountStatus.INACTIVE] as const)(
    'blocks self status change to %s',
    (nextStatus) => {
      expect(() =>
        assertCanUpdateUser({
          actorId: 'self',
          actorRole: 'SA',
          targetId: 'self',
          currentRole: UserRoleCode.SA,
          nextRole: UserRoleCode.SA,
          nextStatus,
        }),
      ).toThrow(ForbiddenException);
    },
  );

  it('blocks IT from editing another IT even to demote it', () => {
    expect(() =>
      assertCanUpdateUser({
        actorId: 'actor',
        actorRole: 'IT',
        targetId: 'target',
        currentRole: UserRoleCode.IT,
        nextRole: UserRoleCode.NVKH,
        nextStatus: UserAccountStatus.ACTIVE,
      }),
    ).toThrow(ForbiddenException);
  });
});
