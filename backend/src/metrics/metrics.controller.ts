import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { FrontendMetricDto } from './dto/frontend-metric.dto';
import { MetricsService } from './metrics.service';
import { Public } from '../common/decorators/public.decorator';
import { MetricsScrapeGuard } from './metrics-scrape.guard';

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
  @Public()
  @UseGuards(MetricsScrapeGuard)
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
