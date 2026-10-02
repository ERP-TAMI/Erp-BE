import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../../common/decorators/auth.decorator';
import { DashboardSummaryQueryDto } from './dto/dashboard-summary-query.dto';
import { ManagementDashboardSummaryDto } from './dto/management-dashboard-summary.dto';
import { DashboardAccessGuard } from './dashboard-access.guard';
import { ManagementDashboardService } from './management-dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(DashboardAccessGuard)
@Auth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly managementDashboardService: ManagementDashboardService,
  ) {}

  @Get('summary')
  @ApiOkResponse({ type: ManagementDashboardSummaryDto })
  @ApiForbiddenResponse({
    description: 'Vai trò không có quyền xem dashboard nghiệp vụ.',
  })
  getSummary(
    @Query() query: DashboardSummaryQueryDto,
  ): Promise<ManagementDashboardSummaryDto> {
    return this.managementDashboardService.getBusinessSummary(query);
  }
}
