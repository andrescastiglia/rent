import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { TenantAccount } from './entities/tenant-account.entity';
import { TenantAccountMovement } from './entities/tenant-account-movement.entity';
import { Invoice } from './entities/invoice.entity';
import { CommissionInvoice } from './entities/commission-invoice.entity';
import { Payment } from './entities/payment.entity';
import { Receipt } from './entities/receipt.entity';
import { Lease } from '../leases/entities/lease.entity';
import { Document } from '../documents/entities/document.entity';

// Services
import { TenantAccountsService } from './tenant-accounts.service';
import { InvoicesService } from './invoices.service';
import { PaymentsService } from './payments.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { InvoicePdfService } from './invoice-pdf.service';

// Controllers
import { TenantAccountsController } from './tenant-accounts.controller';
import { InvoicesController } from './invoices.controller';
import { PaymentsController } from './payments.controller';

// Modules
import { DocumentsModule } from '../documents/documents.module';

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
            Receipt,
            Lease,
            Document,
        ]),
        DocumentsModule,
    ],
    controllers: [
        TenantAccountsController,
        InvoicesController,
        PaymentsController,
    ],
    providers: [
        TenantAccountsService,
        InvoicesService,
        PaymentsService,
        ReceiptPdfService,
        InvoicePdfService,
    ],
    exports: [
        TypeOrmModule,
        TenantAccountsService,
        InvoicesService,
        PaymentsService,
    ],
})
export class PaymentsModule { }
