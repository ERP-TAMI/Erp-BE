import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AuditService } from './audit.service';
import { redactSensitiveData } from './redact-sensitive-data.util';
import { RequestUser } from '../auth/jwt-payload.type';

type AuditableRequest = Request & {
  user?: RequestUser;
  id?: string | number;
};

function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const message = (body as Record<string, unknown>).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join('; ');
  return null;
}

/**
 * Registered as global middleware (see AuditModule.configure) rather than an
 * interceptor: guards run after middleware but before interceptors, so an
 * interceptor would silently skip requests rejected by JwtAuthGuard/
 * PermissionGuard (401/403). Middleware sees every request that reaches the
 * HTTP server, and `res.on('finish')` fires after guards have had a chance
 * to populate `req.user`, so the actor is still captured when available.
 */
@Injectable()
export class HttpAuditLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger(HttpAuditLogMiddleware.name);

  constructor(private readonly auditService: AuditService) {}

  use(req: AuditableRequest, res: Response, next: NextFunction): void {
    const startedAt = Date.now();
    let capturedBody: unknown;
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      capturedBody = body;
      return originalJson(body);
    };

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const actorIdentifier =
        req.user?.email ?? (req.body?.email as string | undefined) ?? null;

      void this.auditService
        .recordHttpRequest({
          occurredAt: new Date(startedAt),
          method: req.method,
          path: req.originalUrl ?? req.url,
          statusCode: res.statusCode ?? null,
          durationMs,
          actorUserId: req.user?.id ?? null,
          actorIdentifier,
          actorRole: req.user?.roleCode ?? null,
          ipAddress: req.ip ?? null,
          userAgent: req.headers['user-agent'] ?? null,
          requestId: req.id ? String(req.id) : null,
          queryParams: redactSensitiveData(req.query) as Record<
            string,
            unknown
          > | null,
          requestBody: redactSensitiveData(req.body) as Record<
            string,
            unknown
          > | null,
          errorMessage:
            res.statusCode >= 400 ? extractErrorMessage(capturedBody) : null,
        })
        .catch((error: Error) => {
          this.logger.error(
            `Failed to persist http audit log for [${req.method}] ${req.originalUrl ?? req.url}`,
            error.stack,
          );
        });
    });

    next();
  }
}
