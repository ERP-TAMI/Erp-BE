import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '../../common/decorators/auth.decorator';
import { ManagementDashboardQueryDto } from './dto/management-dashboard-query.dto';
import { ManagementDashboardSummaryDto } from './dto/management-dashboard-summary.dto';
import { ManagementDashboardService } from './management-dashboard.service';

const MANAGEMENT_ACCESS_PERMISSION = 'management.area.access';

@ApiTags('Management Dashboard')
@ApiBearerAuth()
@Auth(MANAGEMENT_ACCESS_PERMISSION)
@Controller('management/dashboard')
export class ManagementDashboardController {
  constructor(
    private readonly managementDashboardService: ManagementDashboardService,
  ) {}

  @Get('summary')
  @ApiOkResponse({ type: ManagementDashboardSummaryDto })
  getSummary(
    @Query() query: ManagementDashboardQueryDto,
  ): Promise<ManagementDashboardSummaryDto> {
    return this.managementDashboardService.getSummary(query.month);
  }
}
