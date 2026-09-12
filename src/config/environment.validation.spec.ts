import { validateEnvironment } from './environment.validation';

describe('validateEnvironment', () => {
  it('fails fast when production SMTP configuration is incomplete', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        MAIL_HOST: 'smtp.gmail.com',
      }),
    ).toThrow('Missing required production mail configuration');
  });

  it('accepts complete production SMTP configuration including legacy aliases', () => {
    const environment = {
      NODE_ENV: 'production',
      MAIL_HOST: 'smtp.gmail.com',
      MAIL_PORT: '587',
      MAIL_USER: 'sender@example.test',
      MAIL_PASS: 'secret',
      FRONTEND_URL: 'https://erp.example.test',
    };

    expect(validateEnvironment(environment)).toBe(environment);
  });

  it('allows development to boot without SMTP configuration', () => {
    const environment = { NODE_ENV: 'development' };
    expect(validateEnvironment(environment)).toBe(environment);
  });
});
