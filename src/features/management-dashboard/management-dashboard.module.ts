import { Module } from '@nestjs/common';
import { ManagementDashboardController } from './management-dashboard.controller';
import { DashboardController } from './dashboard.controller';
import { DashboardAccessGuard } from './dashboard-access.guard';
import { ManagementDashboardService } from './management-dashboard.service';

@Module({
  controllers: [ManagementDashboardController, DashboardController],
  providers: [ManagementDashboardService, DashboardAccessGuard],
})
export class ManagementDashboardModule {}
