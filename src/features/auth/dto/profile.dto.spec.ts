import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMyProfileDto } from './profile.dto';

describe('UpdateMyProfileDto', () => {
  async function validatePhone(phone: string) {
    return validate(
      plainToInstance(UpdateMyProfileDto, {
        fullName: 'Nguyễn Văn A',
        phone,
      }),
    );
  }

  it('rejects a phone number made from one repeated digit', async () => {
    const errors = await validatePhone('000000000');

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'phone' })]),
    );
  });

  it('accepts a formatted international phone number', async () => {
    await expect(validatePhone('+84 (0) 905-123-456')).resolves.toHaveLength(0);
  });
});
