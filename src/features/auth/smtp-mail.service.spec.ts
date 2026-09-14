import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { SmtpMailService } from './smtp-mail.service';

const sendMail = jest.fn();
const close = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail, close })),
}));

describe('SmtpMailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue({ messageId: 'test' });
  });

  it('uses STARTTLS and sends HTML plus text without a temporary password', async () => {
    const values: Record<string, string> = {
      MAIL_HOST: 'smtp.gmail.com',
      MAIL_PORT: '587',
      MAIL_USERNAME: 'sender@example.test',
      MAIL_PASSWORD: 'secret-from-env',
      MAIL_FROM: 'TAMI ERP <sender@example.test>',
      FRONTEND_URL: 'https://erp.example.test',
    };
    const config = {
      getOrThrow: jest.fn((key: string) => values[key]),
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
    const service = new SmtpMailService(config);

    await service.sendPasswordSetupEmail({
      email: 'new.user@example.test',
      fullName: '<Người dùng>',
      token: 'opaque-token',
      accountAvailable: true,
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 587,
        secure: false,
        requireTLS: true,
        pool: true,
        maxConnections: 2,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      }),
    );
    const message = sendMail.mock.calls[0][0];
    expect(message.text).toContain('token=opaque-token');
    expect(message.html).toContain('&lt;Người dùng&gt;');
    expect(JSON.stringify(message)).not.toContain('secret-from-env');
    expect(message.text.toLowerCase()).not.toContain('mật khẩu tạm');
  });

  it('reuses the SMTP pool and closes it during shutdown', async () => {
    const values: Record<string, string> = {
      MAIL_HOST: 'smtp.gmail.com',
      MAIL_PORT: '587',
      MAIL_USERNAME: 'sender@example.test',
      MAIL_PASSWORD: 'secret-from-env',
      FRONTEND_URL: 'https://erp.example.test',
    };
    const config = {
      getOrThrow: jest.fn((key: string) => values[key]),
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
    const service = new SmtpMailService(config);
    const input = {
      email: 'new.user@example.test',
      fullName: 'Người dùng',
      token: 'opaque-token',
      accountAvailable: true,
    };

    await service.sendPasswordSetupEmail(input);
    await service.sendPasswordSetupEmail(input);
    service.onModuleDestroy();

    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
