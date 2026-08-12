import { applyDecorators, UseGuards } from '@nestjs/common';
import { Permission } from './permission.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionGuard } from '../guards/permission.guard';

export const Auth = (permission?: string) =>
  applyDecorators(
    UseGuards(JwtAuthGuard, PermissionGuard),
    ...(permission ? [Permission(permission)] : []),
  );
