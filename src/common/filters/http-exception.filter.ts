import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

// Khớp với FE-TAMI/src/lib/apiError.ts và ErrorCode enum cũ — không đổi contract `code`.
const STATUS_TO_ERROR_CODE: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'RESOURCE_NOT_FOUND',
  409: 'CONFLICT',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Chỉ dùng để log server-side — không lộ message lỗi JS/DB gốc ra response trả về client.
    const logRes =
      exception instanceof HttpException
        ? exception.getResponse()
        : (exception as Error)?.message || 'Internal Server Error';

    this.logger.error(
      `[${request.method}] ${request.url} - Status: ${status} - Error: ${JSON.stringify(logRes)}`,
      (exception as Error)?.stack,
    );

    if (response.headersSent) {
      return;
    }

    const res = exception instanceof HttpException
      ? exception.getResponse()
      : 'Internal server error';

    const errorBody =
      typeof res === 'object' && res !== null
        ? (res as Record<string, any>)
        : { message: res };

    response.status(status).json({
      statusCode: status,
      code: errorBody.code || STATUS_TO_ERROR_CODE[status] || 'INTERNAL_SERVER_ERROR',
      timestamp: new Date().toISOString(),
      path: request.url,
      ...errorBody,
    });
  }
}
