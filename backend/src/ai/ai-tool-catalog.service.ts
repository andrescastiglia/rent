import { AuthService } from '../auth/auth.service';
import { Injectable } from '@nestjs/common';
import { CurrenciesService } from '../currencies/currencies.service';
import { UsersService } from '../users/users.service';
import { DocumentsService } from '../documents/documents.service';
import { InterestedService } from '../interested/interested.service';
import { PropertiesService } from '../properties/properties.service';
import { PropertyVisitsService } from '../properties/property-visits.service';
import { UnitsService } from '../properties/units.service';
import { LeasesService } from '../leases/leases.service';
import { AmendmentsService } from '../leases/amendments.service';
import { PdfService } from '../leases/pdf.service';
import { OwnersService } from '../owners/owners.service';
import { PaymentsService } from '../payments/payments.service';
import { InvoicesService } from '../payments/invoices.service';
import { InvoicePdfService } from '../payments/invoice-pdf.service';
import { TenantAccountsService } from '../payments/tenant-accounts.service';
import { PaymentDocumentTemplatesService } from '../payments/payment-document-templates.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { SalesService } from '../sales/sales.service';
import { TenantsService } from '../tenants/tenants.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { buildAiToolDefinitions } from './openai-tools.registry';
import { AiToolDefinition } from './types/ai-tool.types';

@Injectable()
export class AiToolCatalogService {
  private readonly definitions: AiToolDefinition[];

  constructor(
    // NOSONAR
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
  ) {
    this.definitions = buildAiToolDefinitions({
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
    });
  }

  getDefinitions(): AiToolDefinition[] {
    return this.definitions;
  }

  getDefinitionByName(name: string): AiToolDefinition | undefined {
    return this.definitions.find((tool) => tool.name === name);
  }
}
