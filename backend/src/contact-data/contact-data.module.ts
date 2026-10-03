import { ContactDataPrivacyInterceptor } from './contact-data-privacy.interceptor';
import { MetricsModule } from '../metrics/metrics.module';
import { Module } from '@nestjs/common';
import { ContactDataService } from './contact-data.service';
import { ContactDataController } from './contact-data.controller';
@Module({
  imports: [MetricsModule],
  controllers: [ContactDataController],
  providers: [ContactDataService, ContactDataPrivacyInterceptor],
  exports: [ContactDataService],
})
export class ContactDataModule {}
