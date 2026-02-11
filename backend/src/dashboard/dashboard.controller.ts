import { Controller, Get, UseGuards, Request, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { RecentActivityDto } from './dto/recent-activity.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

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
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const companyId = req.user.companyId;
    return this.dashboardService.getRecentActivity(
      companyId,
      req.user,
      limitNum,
    );
  }
}
