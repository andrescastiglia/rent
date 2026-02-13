import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CurrenciesModule } from '../currencies/currencies.module';
import { DocumentsModule } from '../documents/documents.module';
import { InterestedModule } from '../interested/interested.module';
import { UsersModule } from '../users/users.module';
import { PropertiesModule } from '../properties/properties.module';
import { LeasesModule } from '../leases/leases.module';
import { OwnersModule } from '../owners/owners.module';
import { PaymentsModule } from '../payments/payments.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { SalesModule } from '../sales/sales.module';
import { TenantsModule } from '../tenants/tenants.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AiController } from './ai.controller';
import { AiToolCatalogService } from './ai-tool-catalog.service';
import { AiToolExecutorService } from './ai-tool-executor.service';
import { AiOpenAiService } from './ai-openai.service';
import { AiToolsRegistryService } from './ai-tools-registry.service';

@Module({
  imports: [
    AuthModule,
    CurrenciesModule,
    DocumentsModule,
    InterestedModule,
    UsersModule,
    PropertiesModule,
    LeasesModule,
    OwnersModule,
    PaymentsModule,
    DashboardModule,
    SalesModule,
    TenantsModule,
    WhatsappModule,
  ],
  controllers: [AiController],
  providers: [
    AiToolCatalogService,
    AiToolExecutorService,
    AiOpenAiService,
    AiToolsRegistryService,
  ],
  exports: [
    AiToolCatalogService,
    AiToolExecutorService,
    AiOpenAiService,
    AiToolsRegistryService,
  ],
})
export class AiModule {}
