import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '../../common/decorators/auth.decorator';
import { AuditService, PaginatedHttpAuditLogs } from './audit.service';
import { QueryHttpAuditLogsDto } from './dto/query-http-audit-logs.dto';

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
}
