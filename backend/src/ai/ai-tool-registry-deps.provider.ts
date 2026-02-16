import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { CurrenciesService } from '../currencies/currencies.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { DocumentsService } from '../documents/documents.service';
import { InterestedService } from '../interested/interested.service';
import { LeasesService } from '../leases/leases.service';
import { AmendmentsService } from '../leases/amendments.service';
import { PdfService } from '../leases/pdf.service';
import { OwnersService } from '../owners/owners.service';
import { PaymentsService } from '../payments/payments.service';
import { InvoicesService } from '../payments/invoices.service';
import { InvoicePdfService } from '../payments/invoice-pdf.service';
import { TenantAccountsService } from '../payments/tenant-accounts.service';
import { PaymentDocumentTemplatesService } from '../payments/payment-document-templates.service';
import { PropertiesService } from '../properties/properties.service';
import { PropertyVisitsService } from '../properties/property-visits.service';
import { UnitsService } from '../properties/units.service';
import { SalesService } from '../sales/sales.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AiToolRegistryDeps } from './openai-tools.registry';

@Injectable()
export class AiToolRegistryDepsProvider implements AiToolRegistryDeps {
  constructor(
    readonly authService: AuthService,
    readonly usersService: UsersService,
    readonly currenciesService: CurrenciesService,
    readonly dashboardService: DashboardService,
    readonly documentsService: DocumentsService,
    readonly interestedService: InterestedService,
    readonly leasesService: LeasesService,
    readonly amendmentsService: AmendmentsService,
    readonly pdfService: PdfService,
    readonly ownersService: OwnersService,
    readonly paymentsService: PaymentsService,
    readonly invoicesService: InvoicesService,
    readonly invoicePdfService: InvoicePdfService,
    readonly tenantAccountsService: TenantAccountsService,
    readonly paymentDocumentTemplatesService: PaymentDocumentTemplatesService,
    readonly propertiesService: PropertiesService,
    readonly propertyVisitsService: PropertyVisitsService,
    readonly unitsService: UnitsService,
    readonly salesService: SalesService,
    readonly tenantsService: TenantsService,
    readonly whatsappService: WhatsappService,
  ) {}
}
