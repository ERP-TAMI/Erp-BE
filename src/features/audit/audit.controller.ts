import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Auth } from '../../common/decorators/auth.decorator';
import {
  AuditService,
  EntityHistoryEvent,
  PaginatedHttpAuditLogs,
} from './audit.service';
import { QueryHttpAuditLogsDto } from './dto/query-http-audit-logs.dto';
import { QueryEntityHistoryDto } from './dto/query-entity-history.dto';
import { RequestUser } from '../auth/jwt-payload.type';

type AuthenticatedRequest = Request & { user: RequestUser };

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Auth('system.audit.view')
  @ApiOkResponse({ description: 'Paginated system-wide HTTP audit log' })
  findAll(
    @Query() query: QueryHttpAuditLogsDto,
  ): Promise<PaginatedHttpAuditLogs> {
    return this.auditService.findHttpAuditLogs(query);
  }

  @Get('history')
  @Auth()
  @ApiOkResponse({
    description:
      'Lịch sử thay đổi (changelog) của 1 bản ghi cụ thể, ví dụ 1 công đoạn quy trình',
  })
  findEntityHistory(
    @Query() query: QueryEntityHistoryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<EntityHistoryEvent[]> {
    return this.auditService.findEntityHistory(
      query.aggregateType,
      query.aggregateId,
      req.user.permissions,
    );
  }
}
