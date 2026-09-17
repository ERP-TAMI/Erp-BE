import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AUTH_ENTITIES } from './entities';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { DEFAULT_ACCESS_TOKEN_EXPIRY } from './auth.constants';
import { PasswordSetupService } from './password-setup.service';
import { SmtpMailService } from './smtp-mail.service';
import { PasswordResetService } from './password-reset.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from '../audit/audit.module';
import { ProfileService } from './profile.service';
import {
  FORGOT_PASSWORD_RATE_LIMIT,
  FORGOT_PASSWORD_RATE_LIMIT_TTL_MS,
} from './auth.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature(AUTH_ENTITIES),
    NotificationsModule,
    AuditModule,
    ThrottlerModule.forRoot([
      {
        ttl: FORGOT_PASSWORD_RATE_LIMIT_TTL_MS,
        limit: FORGOT_PASSWORD_RATE_LIMIT,
      },
    ]),
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'change-me-in-local-env',
        signOptions: {
          expiresIn: (process.env.JWT_EXPIRY ??
            DEFAULT_ACCESS_TOKEN_EXPIRY) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    PasswordSetupService,
    PasswordResetService,
    SmtpMailService,
    ProfileService,
  ],
  exports: [
    AuthService,
    PasswordSetupService,
    PasswordResetService,
    SmtpMailService,
  ],
})
export class AuthModule {}
