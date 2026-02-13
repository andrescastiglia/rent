import { Controller, Get, UseGuards, Request, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { RecentActivityDto } from './dto/recent-activity.dto';
import { ReportJobsDto } from './dto/report-jobs.dto';
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
    @Query('limit') limit?: string,
  ): Promise<RecentActivityDto> {
    const limitNum = limit ? Number.parseInt(limit, 10) : 10;
    const companyId = req.user.companyId;
    return this.dashboardService.getRecentActivity(
      companyId,
      req.user,
      limitNum,
    );
  }

  @Get('reports')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  async getReports(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<ReportJobsDto> {
    const companyId = req.user.companyId;
    const pageNum = page ? Number.parseInt(page, 10) : 1;
    const limitNum = limit ? Number.parseInt(limit, 10) : 25;
    return this.dashboardService.getReportJobs(
      companyId,
      req.user,
      pageNum,
      limitNum,
    );
  }
}
