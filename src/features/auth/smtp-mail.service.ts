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
      : 'Sau khi đặt mật khẩu, tài khoản hiện chưa thể đăng nhập. Vui lòng liên hệ quản trị viên để được mở tài khoản.';

    await this.getTransporter(user, pass).sendMail({
      from,
      to: input.email,
      subject: 'Thiết lập mật khẩu tài khoản TAMI ERP',
      text: `Xin chào ${input.fullName},\n\nBạn được yêu cầu thiết lập mật khẩu cho tài khoản TAMI ERP. Hãy đặt mật khẩu tại: ${setupUrl.toString()}\n\nLiên kết hết hạn sau 24 giờ và chỉ dùng được một lần. ${availabilityNote}`,
      html: `<p>Xin chào ${escapeHtml(input.fullName)},</p><p>Bạn được yêu cầu thiết lập mật khẩu cho tài khoản TAMI ERP.</p><p><a href="${escapeHtml(setupUrl.toString())}">Đặt mật khẩu</a></p><p>Liên kết hết hạn sau 24 giờ và chỉ dùng được một lần.</p><p>${escapeHtml(availabilityNote)}</p>`,
    });
  }

  async sendAccountLockedEmail(input: {
    email: string;
    fullName: string;
    reason: string;
  }): Promise<void> {
    return this.sendAccountRestrictionEmail(input, {
      subject: 'Tài khoản TAMI ERP đã bị khóa',
      description: 'Tài khoản TAMI ERP của bạn đã bị quản trị viên khóa.',
    });
  }

  async sendPasswordResetEmail(input: {
    email: string;
    fullName: string;
    token: string;
  }): Promise<void> {
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL');
    const resetUrl = new URL('/reset-password', frontendUrl);
    resetUrl.searchParams.set('token', input.token);
    const user =
      this.config.get<string>('MAIL_USERNAME') ||
      this.config.getOrThrow<string>('MAIL_USER');
    const pass =
      this.config.get<string>('MAIL_PASSWORD') ||
      this.config.getOrThrow<string>('MAIL_PASS');
    const from = this.config.get<string>('MAIL_FROM') || user;

    await this.getTransporter(user, pass).sendMail({
      from,
      to: input.email,
      subject: 'Đặt lại mật khẩu TAMI ERP',
      text: `Xin chào ${input.fullName},\n\nBạn đã yêu cầu đặt lại mật khẩu TAMI ERP. Hãy đặt mật khẩu mới tại: ${resetUrl.toString()}\n\nLiên kết hết hạn sau 24 giờ và chỉ dùng được một lần. Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.`,
      html: `<p>Xin chào ${escapeHtml(input.fullName)},</p><p>Bạn đã yêu cầu đặt lại mật khẩu TAMI ERP.</p><p><a href="${escapeHtml(resetUrl.toString())}">Đặt lại mật khẩu</a></p><p>Liên kết hết hạn sau 24 giờ và chỉ dùng được một lần.</p><p>Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.</p>`,
    });
  }

  async sendTemporaryAccountLockEmail(input: {
    email: string;
    fullName: string;
    lockedAt: Date;
    lockoutUntil: Date;
  }): Promise<void> {
    const user =
      this.config.get<string>('MAIL_USERNAME') ||
      this.config.getOrThrow<string>('MAIL_USER');
    const pass =
      this.config.get<string>('MAIL_PASSWORD') ||
      this.config.getOrThrow<string>('MAIL_PASS');
    const from = this.config.get<string>('MAIL_FROM') || user;
    const formatTime = (value: Date) =>
      new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        dateStyle: 'short',
        timeStyle: 'medium',
      }).format(value);
    const lockedAt = formatTime(input.lockedAt);
    const lockoutUntil = formatTime(input.lockoutUntil);

    await this.getTransporter(user, pass).sendMail({
      from,
      to: input.email,
      subject: 'Tài khoản TAMI ERP bị khóa tạm thời',
      text: `Xin chào ${input.fullName},\n\nTài khoản của bạn bị khóa tạm thời trong 15 phút do nhập sai mật khẩu 5 lần liên tiếp.\n\nThời điểm khóa: ${lockedAt}\nTự động mở khóa lúc: ${lockoutUntil}\n\nNếu đây không phải hoạt động của bạn, vui lòng liên hệ IT/Admin.`,
      html: `<p>Xin chào ${escapeHtml(input.fullName)},</p><p>Tài khoản của bạn bị khóa tạm thời trong 15 phút do nhập sai mật khẩu 5 lần liên tiếp.</p><p><strong>Thời điểm khóa:</strong> ${escapeHtml(lockedAt)}<br><strong>Tự động mở khóa lúc:</strong> ${escapeHtml(lockoutUntil)}</p><p>Nếu đây không phải hoạt động của bạn, vui lòng liên hệ IT/Admin.</p>`,
    });
  }

  private async sendAccountRestrictionEmail(
    input: { email: string; fullName: string; reason: string },
    content: { subject: string; description: string },
  ): Promise<void> {
    const user =
      this.config.get<string>('MAIL_USERNAME') ||
      this.config.getOrThrow<string>('MAIL_USER');
    const pass =
      this.config.get<string>('MAIL_PASSWORD') ||
      this.config.getOrThrow<string>('MAIL_PASS');
    const from = this.config.get<string>('MAIL_FROM') || user;

    await this.getTransporter(user, pass).sendMail({
      from,
      to: input.email,
      subject: content.subject,
      text: `Xin chào ${input.fullName},\n\n${content.description}\n\nLý do: ${input.reason}\n\nVui lòng liên hệ quản trị viên nếu bạn cần hỗ trợ.`,
      html: `<p>Xin chào ${escapeHtml(input.fullName)},</p><p>${escapeHtml(content.description)}</p><p><strong>Lý do:</strong> ${escapeHtml(input.reason)}</p><p>Vui lòng liên hệ quản trị viên nếu bạn cần hỗ trợ.</p>`,
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
