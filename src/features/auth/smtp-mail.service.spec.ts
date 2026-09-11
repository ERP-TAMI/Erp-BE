import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { SmtpMailService } from './smtp-mail.service';

const sendMail = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail })),
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
      expect.objectContaining({ port: 587, secure: false, requireTLS: true }),
    );
    const message = sendMail.mock.calls[0][0];
    expect(message.text).toContain('token=opaque-token');
    expect(message.html).toContain('&lt;Người dùng&gt;');
    expect(JSON.stringify(message)).not.toContain('secret-from-env');
    expect(message.text.toLowerCase()).not.toContain('mật khẩu tạm');
  });
});
