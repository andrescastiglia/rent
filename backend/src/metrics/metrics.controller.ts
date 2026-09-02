import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { FrontendMetricDto } from './dto/frontend-metric.dto';
import { MetricsService } from './metrics.service';

@Controller()
@Roles(
  UserRole.ADMIN,
  UserRole.STAFF,
  UserRole.OWNER,
  UserRole.TENANT,
  UserRole.BUYER,
)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  async getMetrics(
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    response.setHeader('Content-Type', this.metricsService.getContentType());
    return this.metricsService.getMetrics();
  }

  @Post('frontend-metrics')
  @HttpCode(202)
  recordFrontendMetric(@Body() metric: FrontendMetricDto): void {
    this.metricsService.recordFrontendMetric(metric);
  }
}
