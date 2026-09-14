import {
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ErrorCode } from '../src/common/enums/error-code.enum';
import { AuthController } from '../src/features/auth/auth.controller';
import { AuthService } from '../src/features/auth/auth.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PasswordSetupService } from '../src/features/auth/password-setup.service';
import { PasswordResetService } from '../src/features/auth/password-reset.service';
import { ProfileService } from '../src/features/auth/profile.service';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  FORGOT_PASSWORD_RATE_LIMIT,
  FORGOT_PASSWORD_RATE_LIMIT_TTL_MS,
} from '../src/features/auth/auth.constants';

describe('Auth API (e2e)', () => {
  const authService = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    getMe: jest.fn(),
  };
  const passwordSetupService = {
    validate: jest.fn(),
    complete: jest.fn(),
  };
  const passwordResetService = {
    request: jest.fn(),
    deliver: jest.fn(),
    validate: jest.fn(),
    complete: jest.fn(),
  };
  const profileService = {
    updateProfile: jest.fn(),
    changePassword: jest.fn(),
  };
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            ttl: FORGOT_PASSWORD_RATE_LIMIT_TTL_MS,
            limit: FORGOT_PASSWORD_RATE_LIMIT,
          },
        ]),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: PasswordSetupService, useValue: passwordSetupService },
        { provide: PasswordResetService, useValue: passwordResetService },
        { provide: ProfileService, useValue: profileService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          const authHeader = req.headers.authorization as string | undefined;
          if (!authHeader) {
            throw new UnauthorizedException({
              code: ErrorCode.UNAUTHORIZED,
              message: 'Phiên đăng nhập không hợp lệ.',
            });
          }
          req.user = {
            id: 'user-1',
            email: 'sa@tami.test',
            roleCode: 'SA',
            permissions: ['system.users.manage'],
          };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  it('accepts forgot-password requests and validates the public reset contract', async () => {
    const issued = {
      user: { id: 'user-1', email: 'user@tami.test' },
      token: 'raw-token',
    };
    passwordResetService.request.mockResolvedValue(issued);
    passwordResetService.deliver.mockResolvedValue(undefined);
    passwordResetService.validate.mockResolvedValue({
      valid: true,
      expiresAt: '2026-09-15T00:00:00.000Z',
    });
    passwordResetService.complete.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'user@tami.test' })
      .expect(202)
      .expect({ status: 'pending' });
    await request(app.getHttpServer())
      .post('/auth/password-reset/validate')
      .send({ token: 'opaque-token' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/password-reset/complete')
      .send({ token: 'opaque-token', password: 'a secure passphrase' })
      .expect(204);

    expect(passwordResetService.request).toHaveBeenCalledWith('user@tami.test');
    expect(passwordResetService.deliver).toHaveBeenCalledWith(issued);
    expect(passwordResetService.complete).toHaveBeenCalledWith(
      'opaque-token',
      'a secure passphrase',
    );
  });

  it('rate limits forgot-password requests by client address', async () => {
    passwordResetService.request.mockResolvedValue({
      user: { id: 'user-1', email: 'user@tami.test' },
      token: 'raw-token',
    });
    passwordResetService.deliver.mockResolvedValue(undefined);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: `user-${attempt}@tami.test` })
        .expect(202);
    }

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'sixth-user@tami.test' })
      .expect(429);
  });

  afterEach(async () => {
    await app.close();
  });

  it('validates and consumes a public one-time password setup token', async () => {
    passwordSetupService.validate.mockResolvedValue({
      valid: true,
      expiresAt: '2026-09-12T00:00:00.000Z',
    });
    passwordSetupService.complete.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/auth/password-setup/validate')
      .send({ token: 'opaque-token' })
      .expect(200)
      .expect({ valid: true, expiresAt: '2026-09-12T00:00:00.000Z' });
    await request(app.getHttpServer())
      .post('/auth/password-setup/complete')
      .send({ token: 'opaque-token', password: 'a secure passphrase' })
      .expect(204);

    expect(passwordSetupService.complete).toHaveBeenCalledWith(
      'opaque-token',
      'a secure passphrase',
    );
  });

  it('rejects invalid password setup bodies before service execution', async () => {
    await request(app.getHttpServer())
      .post('/auth/password-setup/complete')
      .send({ token: '', password: 'short' })
      .expect(400);
    expect(passwordSetupService.complete).not.toHaveBeenCalled();
  });

  it('rejects an invalid request body before it reaches the service', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: '' })
      .expect(400);

    expect(authService.login).not.toHaveBeenCalled();
  });

  it('returns 401 for wrong email or password', async () => {
    authService.login.mockRejectedValue(
      new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Email hoặc mật khẩu không đúng.',
      }),
    );

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'sa@tami.test', password: 'wrong' })
      .expect(401)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: ErrorCode.INVALID_CREDENTIALS,
        });
      });
  });

  it('returns 403 for a locked account', async () => {
    authService.login.mockRejectedValue(
      new ForbiddenException({
        code: ErrorCode.ACCOUNT_TEMPORARILY_LOCKED,
        message: 'Tài khoản đang tạm khoá do đăng nhập sai nhiều lần.',
      }),
    );

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'sa@tami.test', password: 'whatever' })
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: ErrorCode.ACCOUNT_TEMPORARILY_LOCKED,
        });
      });
  });

  it('logs in successfully, sets a refresh cookie, and never returns the refresh token in the body', async () => {
    authService.login.mockResolvedValue({
      accessToken: 'signed.access.token',
      refreshToken: 'raw-refresh-token',
      user: {
        id: 'user-1',
        email: 'sa@tami.test',
        fullName: 'Quản trị hệ thống',
        phone: null,
        roleCode: 'SA',
        roleName: 'Quản trị hệ thống',
        permissions: ['system.users.manage'],
      },
    });

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'sa@tami.test', password: 'correct' })
      .expect(200);

    expect(response.body).toEqual({
      accessToken: 'signed.access.token',
      user: expect.objectContaining({ id: 'user-1', roleCode: 'SA' }),
    });
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(response.body)).not.toContain('password');

    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(setCookie[0]).toContain('refresh_token=');
    expect(setCookie[0].toLowerCase()).toContain('httponly');
  });

  it('rejects GET /auth/me without a token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    expect(authService.getMe).not.toHaveBeenCalled();
  });

  it('returns the current user for GET /auth/me with a valid token', async () => {
    authService.getMe.mockResolvedValue({
      id: 'user-1',
      email: 'sa@tami.test',
      fullName: 'Quản trị hệ thống',
      phone: null,
      roleCode: 'SA',
      roleName: 'Quản trị hệ thống',
      permissions: ['system.users.manage'],
    });

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer signed.access.token')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({ id: 'user-1', roleCode: 'SA' });
      });

    expect(authService.getMe).toHaveBeenCalledWith('user-1');
  });

  it('updates only the authenticated user profile fields', async () => {
    profileService.updateProfile.mockResolvedValue({
      id: 'user-1',
      email: 'sa@tami.test',
      fullName: 'Tên mới',
      phone: '0912345678',
      roleCode: 'SA',
      roleName: 'Quản trị hệ thống',
      permissions: ['system.users.manage'],
    });

    await request(app.getHttpServer())
      .patch('/auth/me')
      .set('Authorization', 'Bearer signed.access.token')
      .send({ fullName: '  Tên mới  ', phone: ' 0912345678 ' })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: 'user-1',
          fullName: 'Tên mới',
          phone: '0912345678',
        });
      });

    expect(profileService.updateProfile).toHaveBeenCalledWith(
      { fullName: 'Tên mới', phone: '0912345678' },
      expect.objectContaining({ id: 'user-1', roleCode: 'SA' }),
    );
  });

  it('rejects forbidden self-profile fields before service execution', async () => {
    await request(app.getHttpServer())
      .patch('/auth/me')
      .set('Authorization', 'Bearer signed.access.token')
      .send({
        fullName: 'Tên mới',
        phone: null,
        email: 'attacker@tami.test',
        roleCode: 'SA',
        status: 'active',
      })
      .expect(400);

    expect(profileService.updateProfile).not.toHaveBeenCalled();
  });

  it('validates and changes the authenticated user password', async () => {
    profileService.changePassword.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .patch('/auth/me/password')
      .set('Authorization', 'Bearer signed.access.token')
      .send({
        currentPassword: 'current-password',
        newPassword: 'new-password',
      })
      .expect(204);

    expect(profileService.changePassword).toHaveBeenCalledWith(
      { currentPassword: 'current-password', newPassword: 'new-password' },
      expect.objectContaining({ id: 'user-1' }),
    );
  });

  it('rejects short passwords and unauthenticated profile mutations', async () => {
    await request(app.getHttpServer())
      .patch('/auth/me/password')
      .set('Authorization', 'Bearer signed.access.token')
      .send({ currentPassword: 'current-password', newPassword: 'short' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/auth/me')
      .send({ fullName: 'Tên mới', phone: null })
      .expect(401);

    expect(profileService.changePassword).not.toHaveBeenCalled();
  });

  it('logs out idempotently and clears the refresh cookie', async () => {
    authService.logout.mockResolvedValue(undefined);

    await request(app.getHttpServer()).post('/auth/logout').expect(204);
    expect(authService.logout).toHaveBeenCalled();
  });
});
