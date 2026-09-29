import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { processDocumentEffects } from '../common/helpers/document-effects-outbox';
import { Invoice } from './entities/invoice.entity';
import { InvoicePdfService, InvoicePdfSnapshot } from './invoice-pdf.service';

@Injectable()
export class InvoiceEffectsService {
  private readonly logger = new Logger(InvoiceEffectsService.name);
  constructor(
    private readonly db: DataSource,
    private readonly pdf: InvoicePdfService,
  ) {}

  processDue() {
    return processDocumentEffects(
      this.db,
      'invoice',
      this.logger,
      (manager, id, companyId) => this.render(manager, id, companyId),
    );
  }

  private async render(manager: EntityManager, id: string, companyId: string) {
    const [event] = await manager.query(
      'SELECT snapshot,document_id FROM invoice_effects_outbox WHERE invoice_id=$1 AND company_id=$2',
      [id, companyId],
    );
    if (!event || event.document_id)
      throw new Error('Invoice job is unavailable or already has an artifact');
    const invoice = await manager.getRepository(Invoice).findOne({
      where: { id, companyId },
      withDeleted: true,
      lock: { mode: 'pessimistic_write' },
    });
    if (!invoice || invoice.pdfUrl)
      throw new Error('Invoice is unavailable or already has an artifact');
    const snapshot = event.snapshot as InvoicePdfSnapshot;
    if (
      snapshot.version !== 1 ||
      snapshot.invoice.id !== id ||
      snapshot.invoice.companyId !== companyId ||
      !snapshot.invoice.issuedAt
    )
      throw new Error('Invalid invoice snapshot');
    // Preserve the original issued document even if the invoice was paid/cancelled later.
    const url = await this.pdf.generateSnapshot(snapshot, manager);
    await manager
      .getRepository(Invoice)
      .update({ id, companyId }, { pdfUrl: url });
    await manager.query(
      'UPDATE invoice_effects_outbox SET document_id=$2 WHERE invoice_id=$1 AND company_id=$3',
      [id, url.slice('db://document/'.length), companyId],
    );
  }
}
