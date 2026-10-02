import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { processDocumentEffects } from '../common/helpers/document-effects-outbox';
import { SaleReceipt } from './entities/sale-receipt.entity';
import { SaleReceiptPdfService } from './sale-receipt-pdf.service';

@Injectable()
export class SaleReceiptEffectsService {
  private readonly logger = new Logger(SaleReceiptEffectsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly pdf: SaleReceiptPdfService,
  ) {}

  processDue() {
    return processDocumentEffects(
      this.dataSource,
      'sale_receipt',
      this.logger,
      (manager, receiptId, companyId) =>
        this.render(manager, receiptId, companyId),
    );
  }

  private async render(
    manager: EntityManager,
    receiptId: string,
    companyId: string,
  ) {
    const repository = manager.getRepository(SaleReceipt);
    const locked = await repository.findOneOrFail({
      where: { id: receiptId },
      lock: { mode: 'pessimistic_write' },
    });
    if (locked.cancelledAt) return;
    const receipt = await repository.findOneOrFail({
      where: { id: receiptId },
      relations: ['agreement', 'agreement.folder'],
    });
    if (receipt.agreement?.companyId !== companyId)
      throw new Error('Sale receipt company mismatch');
    if (receipt.pdfUrl) return;
    receipt.pdfUrl = await this.pdf.generate(
      receipt,
      receipt.agreement,
      manager,
    );
    await repository.save(receipt);
  }
}
