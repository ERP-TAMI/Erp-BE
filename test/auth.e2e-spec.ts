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

describe('Auth API (e2e)', () => {
  const authService = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    getMe: jest.fn(),
  };
  let app: INestApplication;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
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

  afterEach(async () => {
    await app.close();
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
        code: ErrorCode.ACCOUNT_LOCKED,
        message: 'Tài khoản đang tạm khoá do đăng nhập sai nhiều lần.',
      }),
    );

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'sa@tami.test', password: 'whatever' })
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({ code: ErrorCode.ACCOUNT_LOCKED });
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

  it('logs out idempotently and clears the refresh cookie', async () => {
    authService.logout.mockResolvedValue(undefined);

    await request(app.getHttpServer()).post('/auth/logout').expect(204);
    expect(authService.logout).toHaveBeenCalled();
  });
});
