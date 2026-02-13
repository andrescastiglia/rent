import { Controller, Get, UseGuards, Request, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { RecentActivityDto } from './dto/recent-activity.dto';
import { ReportJobsDto } from './dto/report-jobs.dto';
import { RecentActivityQueryDto } from './dto/recent-activity-query.dto';
import { ReportJobsQueryDto } from './dto/report-jobs-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  async getStats(@Request() req: any): Promise<DashboardStatsDto> {
    const companyId = req.user.companyId;
    return this.dashboardService.getStats(companyId, req.user);
  }

  @Get('recent-activity')
  async getRecentActivity(
    @Request() req: any,
    @Query() query: RecentActivityQueryDto,
  ): Promise<RecentActivityDto> {
    const companyId = req.user.companyId;
    return this.dashboardService.getRecentActivity(
      companyId,
      req.user,
      query.limit ?? 10,
    );
  }

  @Get('reports')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  async getReports(
    @Request() req: any,
    @Query() query: ReportJobsQueryDto,
  ): Promise<ReportJobsDto> {
    const companyId = req.user.companyId;
    return this.dashboardService.getReportJobs(
      companyId,
      req.user,
      query.page ?? 1,
      query.limit ?? 25,
    );
  }
}
