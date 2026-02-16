import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { CurrenciesModule } from '../currencies/currencies.module';
import { CurrenciesService } from '../currencies/currencies.service';
import { DocumentsModule } from '../documents/documents.module';
import { DocumentsService } from '../documents/documents.service';
import { InterestedModule } from '../interested/interested.module';
import { InterestedService } from '../interested/interested.service';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { PropertiesModule } from '../properties/properties.module';
import { PropertiesService } from '../properties/properties.service';
import { PropertyVisitsService } from '../properties/property-visits.service';
import { UnitsService } from '../properties/units.service';
import { LeasesModule } from '../leases/leases.module';
import { LeasesService } from '../leases/leases.service';
import { AmendmentsService } from '../leases/amendments.service';
import { PdfService } from '../leases/pdf.service';
import { OwnersModule } from '../owners/owners.module';
import { OwnersService } from '../owners/owners.service';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsService } from '../payments/payments.service';
import { InvoicesService } from '../payments/invoices.service';
import { InvoicePdfService } from '../payments/invoice-pdf.service';
import { TenantAccountsService } from '../payments/tenant-accounts.service';
import { PaymentDocumentTemplatesService } from '../payments/payment-document-templates.service';
import { DashboardModule } from '../dashboard/dashboard.module';
import { DashboardService } from '../dashboard/dashboard.service';
import { SalesModule } from '../sales/sales.module';
import { SalesService } from '../sales/sales.service';
import { TenantsModule } from '../tenants/tenants.module';
import { TenantsService } from '../tenants/tenants.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AiController } from './ai.controller';
import {
  AiToolCatalogService,
  AI_TOOL_REGISTRY_DEPS,
} from './ai-tool-catalog.service';
import { AiToolExecutorService } from './ai-tool-executor.service';
import { AiOpenAiService } from './ai-openai.service';
import { AiToolsRegistryService } from './ai-tools-registry.service';
import { AiToolRegistryDeps } from './openai-tools.registry';

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
    {
      provide: AI_TOOL_REGISTRY_DEPS,
      useFactory: (
        authService: AuthService,
        usersService: UsersService,
        currenciesService: CurrenciesService,
        documentsService: DocumentsService,
        interestedService: InterestedService,
        propertiesService: PropertiesService,
        propertyVisitsService: PropertyVisitsService,
        unitsService: UnitsService,
        leasesService: LeasesService,
        amendmentsService: AmendmentsService,
        pdfService: PdfService,
        ownersService: OwnersService,
        paymentsService: PaymentsService,
        invoicesService: InvoicesService,
        invoicePdfService: InvoicePdfService,
        tenantAccountsService: TenantAccountsService,
        paymentDocumentTemplatesService: PaymentDocumentTemplatesService,
        dashboardService: DashboardService,
        salesService: SalesService,
        tenantsService: TenantsService,
        whatsappService: WhatsappService,
      ): AiToolRegistryDeps => ({
        authService,
        usersService,
        currenciesService,
        documentsService,
        interestedService,
        propertiesService,
        propertyVisitsService,
        unitsService,
        leasesService,
        amendmentsService,
        pdfService,
        ownersService,
        paymentsService,
        invoicesService,
        invoicePdfService,
        tenantAccountsService,
        paymentDocumentTemplatesService,
        dashboardService,
        salesService,
        tenantsService,
        whatsappService,
      }),
      inject: [
        AuthService,
        UsersService,
        CurrenciesService,
        DocumentsService,
        InterestedService,
        PropertiesService,
        PropertyVisitsService,
        UnitsService,
        LeasesService,
        AmendmentsService,
        PdfService,
        OwnersService,
        PaymentsService,
        InvoicesService,
        InvoicePdfService,
        TenantAccountsService,
        PaymentDocumentTemplatesService,
        DashboardService,
        SalesService,
        TenantsService,
        WhatsappService,
      ],
    },
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
