import { hashPassword, verifyPassword } from './password.util';

describe('password.util', () => {
  it('hashes a password to a value different from the plaintext', async () => {
    const hash = await hashPassword('Sup3rSecret!');
    expect(hash).not.toBe('Sup3rSecret!');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('Sup3rSecret!');
    await expect(verifyPassword('Sup3rSecret!', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password against a hash', async () => {
    const hash = await hashPassword('Sup3rSecret!');
    await expect(verifyPassword('WrongPassword', hash)).resolves.toBe(false);
  });

  it('produces different hashes for the same password (random salt)', async () => {
    const [hashA, hashB] = await Promise.all([
      hashPassword('Sup3rSecret!'),
      hashPassword('Sup3rSecret!'),
    ]);
    expect(hashA).not.toBe(hashB);
  });
});
