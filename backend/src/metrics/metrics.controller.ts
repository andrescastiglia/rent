import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { FrontendMetricDto } from './dto/frontend-metric.dto';
import { MetricsService } from './metrics.service';

@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Public()
  @Get('metrics')
  async getMetrics(
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    response.setHeader('Content-Type', this.metricsService.getContentType());
    return this.metricsService.getMetrics();
  }

  @Public()
  @Post('frontend-metrics')
  @HttpCode(202)
  recordFrontendMetric(@Body() metric: FrontendMetricDto): void {
    this.metricsService.recordFrontendMetric(metric);
  }
}
