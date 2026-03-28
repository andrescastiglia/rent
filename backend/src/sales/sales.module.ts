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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SaleFolder,
      SaleAgreement,
      SaleReceipt,
      Buyer,
      Document,
    ]),
    DocumentsModule,
  ],
  controllers: [SalesController],
  providers: [SalesService, SaleReceiptPdfService],
  exports: [SalesService, TypeOrmModule],
})
export class SalesModule {}
