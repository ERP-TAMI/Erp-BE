import { EventEmitter } from 'node:events';
import { HttpAuditLogMiddleware } from './http-audit-log.middleware';
import { AuditService } from './audit.service';

function buildResponse(statusCode: number) {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    statusCode,
    json: jest.fn((body: unknown) => body),
  }) as unknown as import('express').Response;
}

describe('HttpAuditLogMiddleware', () => {
  let auditService: jest.Mocked<AuditService>;
  let middleware: HttpAuditLogMiddleware;

  beforeEach(() => {
    auditService = {
      recordHttpRequest: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    middleware = new HttpAuditLogMiddleware(auditService);
  });

  it('records a successful mutating request with the authenticated actor', async () => {
    const request = {
      method: 'PATCH',
      originalUrl: '/styles/style-1',
      url: '/styles/style-1',
      query: {},
      body: { styleName: 'Áo mới' },
      headers: { 'user-agent': 'jest' },
      ip: '127.0.0.1',
      id: 'req-1',
      user: { id: 'user-1', email: 'sa@tami.test', roleCode: 'SA' },
    };
    const response = buildResponse(200);
    const next = jest.fn();

    middleware.use(request as any, response, next);
    expect(next).toHaveBeenCalled();

    response.emit('finish');
    await Promise.resolve();
    await Promise.resolve();

    expect(auditService.recordHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PATCH',
        path: '/styles/style-1',
        statusCode: 200,
        actorUserId: 'user-1',
        actorRole: 'SA',
        errorMessage: null,
      }),
    );
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'does not record a %s request — read-only traffic dwarfs mutations and adds no investigative value',
    async (method) => {
      const request = {
        method,
        originalUrl: '/styles?page=1',
        url: '/styles?page=1',
        query: { page: '1' },
        body: {},
        headers: { 'user-agent': 'jest' },
        ip: '127.0.0.1',
        id: 'req-skip',
        user: { id: 'user-1', email: 'sa@tami.test', roleCode: 'SA' },
      };
      const response = buildResponse(200);
      const next = jest.fn();

      middleware.use(request as any, response, next);
      expect(next).toHaveBeenCalled();

      response.emit('finish');
      await Promise.resolve();
      await Promise.resolve();

      expect(auditService.recordHttpRequest).not.toHaveBeenCalled();
    },
  );

  it('captures the error message and redacts the password for a failed request with no authenticated actor', async () => {
    const request = {
      method: 'POST',
      originalUrl: '/auth/login',
      url: '/auth/login',
      query: {},
      body: { email: 'sa@tami.test', password: 'secret' },
      headers: {},
      ip: '127.0.0.1',
      id: 'req-2',
    };
    const response = buildResponse(401);
    const next = jest.fn();

    middleware.use(request as any, response, next);
    (response as unknown as { json: (b: unknown) => unknown }).json({
      code: 'INVALID_CREDENTIALS',
      message: 'Email hoặc mật khẩu không đúng.',
    });
    response.emit('finish');
    await Promise.resolve();
    await Promise.resolve();

    expect(auditService.recordHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/auth/login',
        statusCode: 401,
        actorUserId: null,
        actorIdentifier: 'sa@tami.test',
        requestBody: expect.objectContaining({ password: '[REDACTED]' }),
        errorMessage: 'Email hoặc mật khẩu không đúng.',
      }),
    );
  });
});
