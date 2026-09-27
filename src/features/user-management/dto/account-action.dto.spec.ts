import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AccountStatusActionDto,
  PasswordResetResponseDto,
} from './account-action.dto';
import { UserAccountStatus } from './user-account-status.enum';

describe('AccountStatusActionDto', () => {
  it('requires a non-blank reason for locked', async () => {
    const dto = plainToInstance(AccountStatusActionDto, {
      accountStatus: UserAccountStatus.LOCKED,
      reason: '   ',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects inactive as a status mutation', async () => {
    const dto = plainToInstance(AccountStatusActionDto, {
      accountStatus: UserAccountStatus.INACTIVE,
      reason: 'Nhân viên đã nghỉ việc',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('allows active without a reason', async () => {
    const dto = plainToInstance(AccountStatusActionDto, {
      accountStatus: UserAccountStatus.ACTIVE,
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('trims and accepts a valid reason', async () => {
    const dto = plainToInstance(AccountStatusActionDto, {
      accountStatus: UserAccountStatus.LOCKED,
      reason: '  Vi phạm chính sách  ',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.reason).toBe('Vi phạm chính sách');
  });

  it('documents the password reset response contract', () => {
    expect(PasswordResetResponseDto).toBeDefined();
  });
});
