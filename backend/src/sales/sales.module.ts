import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SaleFolder } from './entities/sale-folder.entity';
import { SaleAgreement } from './entities/sale-agreement.entity';
import { SaleReceipt } from './entities/sale-receipt.entity';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { SaleReceiptPdfService } from './sale-receipt-pdf.service';
import { DocumentsModule } from '../documents/documents.module';
import { Document } from '../documents/entities/document.entity';
import { Buyer } from '../buyers/entities/buyer.entity';
import { Lease } from '../leases/entities/lease.entity';
import { Property } from '../properties/entities/property.entity';
import { CommunicationsModule } from '../communications/communications.module';
import { SaleReceiptEffectsService } from './sale-receipt-effects.service';
import { SaleReceiptEffectsController } from './sale-receipt-effects.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SaleFolder,
      SaleAgreement,
      SaleReceipt,
      Buyer,
      Lease,
      Property,
      Document,
    ]),
    DocumentsModule,
    CommunicationsModule,
  ],
  controllers: [SalesController, SaleReceiptEffectsController],
  providers: [SalesService, SaleReceiptPdfService, SaleReceiptEffectsService],
  exports: [SalesService, TypeOrmModule],
})
export class SalesModule {}
