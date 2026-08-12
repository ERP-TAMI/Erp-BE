import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorCode } from '../enums/error-code.enum';

type ErrorResponseBody = {
  code?: string;
  error?: string;
  message?: string | string[];
  statusCode?: number;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const body = this.normalizeBody(exceptionResponse);

    response.status(statusCode).json({
      code: body.code ?? this.mapStatusToCode(statusCode),
      message: body.message ?? body.error ?? 'Internal server error',
      statusCode,
      timestamp: new Date().toISOString(),
    });
  }

  private normalizeBody(response: unknown): ErrorResponseBody {
    if (!response) {
      return {};
    }

    if (typeof response === 'string') {
      return { message: response };
    }

    if (typeof response === 'object') {
      return response as ErrorResponseBody;
    }

    return {};
  }

  private mapStatusToCode(statusCode: number): ErrorCode {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.RESOURCE_NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      default:
        return ErrorCode.INTERNAL_SERVER_ERROR;
    }
  }
}
