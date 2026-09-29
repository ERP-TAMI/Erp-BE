import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AUDIT_ENTITIES } from './entities';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { HttpAuditLogMiddleware } from './http-audit-log.middleware';
import { User } from '../auth/entities/User.entity';

@Module({
  imports: [TypeOrmModule.forFeature([...AUDIT_ENTITIES, User])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(HttpAuditLogMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
