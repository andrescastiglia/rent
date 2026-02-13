import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { TenantAccount } from './entities/tenant-account.entity';
import { TenantAccountMovement } from './entities/tenant-account-movement.entity';
import { Invoice } from './entities/invoice.entity';
import { CommissionInvoice } from './entities/commission-invoice.entity';
import { Payment } from './entities/payment.entity';
import { PaymentItem } from './entities/payment-item.entity';
import { Receipt } from './entities/receipt.entity';
import { CreditNote } from './entities/credit-note.entity';
import { PaymentDocumentTemplate } from './entities/payment-document-template.entity';
import { Lease } from '../leases/entities/lease.entity';
import { Document } from '../documents/entities/document.entity';
import { InflationIndex } from './entities/inflation-index.entity';

// Services
import { TenantAccountsService } from './tenant-accounts.service';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { CreditNotePdfService } from './credit-note-pdf.service';
import { PaymentDocumentTemplatesService } from './payment-document-templates.service';

// Controllers
import { TenantAccountsController } from './tenant-accounts.controller';
import { InvoicesController } from './invoices.controller';
import { PaymentsController } from './payments.controller';
import { PaymentDocumentTemplatesController } from './payment-document-templates.controller';

// Modules
import { DocumentsModule } from '../documents/documents.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

/**
 * Módulo de pagos.
 * Gestiona cuentas corrientes, facturas, pagos y recibos.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantAccount,
      TenantAccountMovement,
      Invoice,
      CommissionInvoice,
      Payment,
      PaymentItem,
      Receipt,
      CreditNote,
      PaymentDocumentTemplate,
      InflationIndex,
      Lease,
      Document,
    ]),
    DocumentsModule,
    WhatsappModule,
  ],
  controllers: [
    TenantAccountsController,
    InvoicesController,
    PaymentsController,
    PaymentDocumentTemplatesController,
  ],
  providers: [
    TenantAccountsService,
    InvoicesService,
    PaymentsService,
    ReceiptPdfService,
    InvoicePdfService,
    CreditNotePdfService,
    PaymentDocumentTemplatesService,
  ],
  exports: [
    TypeOrmModule,
    TenantAccountsService,
    InvoicesService,
    InvoicePdfService,
    PaymentsService,
    PaymentDocumentTemplatesService,
  ],
})
export class PaymentsModule {}
