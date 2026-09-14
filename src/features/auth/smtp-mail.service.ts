import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

@Injectable()
export class SmtpMailService implements OnModuleDestroy {
  private transporter?: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {}

  onModuleDestroy(): void {
    this.transporter?.close();
  }

  async sendPasswordSetupEmail(input: {
    email: string;
    fullName: string;
    token: string;
    accountAvailable: boolean;
  }): Promise<void> {
    const user =
      this.config.get<string>('MAIL_USERNAME') ||
      this.config.getOrThrow<string>('MAIL_USER');
    const pass =
      this.config.get<string>('MAIL_PASSWORD') ||
      this.config.getOrThrow<string>('MAIL_PASS');
    const from = this.config.get<string>('MAIL_FROM') || user;
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const setupUrl = new URL('/set-password', frontendUrl);
    setupUrl.searchParams.set('token', input.token);
    const availabilityNote = input.accountAvailable
      ? 'Sau khi đặt mật khẩu, bạn có thể đăng nhập vào hệ thống.'
      : 'Sau khi đặt mật khẩu, tài khoản vẫn đang bị khóa hoặc vô hiệu hóa. Vui lòng liên hệ quản trị viên để được mở tài khoản.';

    await this.getTransporter(user, pass).sendMail({
      from,
      to: input.email,
      subject: 'Thiết lập mật khẩu tài khoản TAMI ERP',
      text: `Xin chào ${input.fullName},\n\nTài khoản TAMI ERP của bạn đã được tạo. Hãy đặt mật khẩu tại: ${setupUrl.toString()}\n\nLiên kết hết hạn sau 24 giờ và chỉ dùng được một lần. ${availabilityNote}`,
      html: `<p>Xin chào ${escapeHtml(input.fullName)},</p><p>Tài khoản TAMI ERP của bạn đã được tạo.</p><p><a href="${escapeHtml(setupUrl.toString())}">Đặt mật khẩu</a></p><p>Liên kết hết hạn sau 24 giờ và chỉ dùng được một lần.</p><p>${escapeHtml(availabilityNote)}</p>`,
    });
  }

  private getTransporter(user: string, pass: string): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.config.getOrThrow<string>('MAIL_HOST'),
        port: Number(this.config.getOrThrow<string>('MAIL_PORT')),
        secure: false,
        requireTLS: true,
        auth: { user, pass },
        pool: true,
        maxConnections: 2,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
      });
    }
    return this.transporter;
  }
}
