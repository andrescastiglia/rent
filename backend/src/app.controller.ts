import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';
import { CAPABILITY_MANIFEST } from './common/capabilities/capability-manifest';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('capabilities/v1')
  getCapabilities() {
    return CAPABILITY_MANIFEST;
  }
}
