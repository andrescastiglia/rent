import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { processDocumentEffects } from '../common/helpers/document-effects-outbox';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { InvoicePdfService, InvoicePdfSnapshot } from './invoice-pdf.service';
import { CommunicationsService } from '../communications/communications.service';
import {
  CommunicationChannel,
  CommunicationEvent,
  CommunicationRecipientRole,
} from '../communications/entities/communication-template.entity';
import { formatInvoiceDate } from './invoice-date';

@Injectable()
export class InvoiceEffectsService {
  private readonly logger = new Logger(InvoiceEffectsService.name);
  constructor(
    private readonly db: DataSource,
    private readonly pdf: InvoicePdfService,
    private readonly communications: CommunicationsService,
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
    if (
      !invoice.deletedAt &&
      [
        InvoiceStatus.PENDING,
        InvoiceStatus.SENT,
        InvoiceStatus.PARTIAL,
        InvoiceStatus.OVERDUE,
      ].includes(invoice.status)
    )
      await this.queueNotification(manager, invoice, snapshot, url);
  }

  private async queueNotification(
    manager: EntityManager,
    invoice: Invoice,
    snapshot: InvoicePdfSnapshot,
    url: string,
  ) {
    const tenantId = snapshot.invoice.lease?.tenant?.id;
    if (!tenantId) return;
    const [recipient] = await manager.query(
      `SELECT t.id,u.phone,u.language,CONCAT_WS(' ',u.first_name,u.last_name) AS name
       FROM leases l JOIN tenants t ON t.id=l.tenant_id AND t.company_id=$2 AND t.deleted_at IS NULL
       JOIN users u ON u.id=t.user_id AND u.company_id=$2 AND u.deleted_at IS NULL
       WHERE l.id=$1 AND l.company_id=$2 AND l.deleted_at IS NULL AND t.id=$3
       AND t.contact_consent=true AND u.whatsapp_enabled=true
       AND (t.preferred_contact_channel IS NULL OR t.preferred_contact_channel='whatsapp')
       AND u.phone IS NOT NULL`,
      [invoice.leaseId, invoice.companyId, tenantId],
    );
    if (!recipient) return;
    const locale = recipient.language ?? 'es';
    const dueDate = formatInvoiceDate(snapshot.invoice.dueDate, locale);
    const amount = `${snapshot.invoice.currencyCode} ${Number(snapshot.invoice.total).toFixed(2)}`;
    await this.communications.dispatchEvent(
      {
        companyId: invoice.companyId,
        event: CommunicationEvent.INVOICE_ISSUED,
        recipientRole: CommunicationRecipientRole.TENANT,
        recipientId: recipient.id,
        channel: CommunicationChannel.WHATSAPP,
        recipient: recipient.phone,
        locale,
        variables: {
          nombre: recipient.name,
          factura: snapshot.invoice.invoiceNumber,
          vencimiento: dueDate,
          monto: amount,
          link_pago: snapshot.paymentUrl,
        },
        fallbackBody:
          'Hola {{nombre}}, tu factura {{factura}} está disponible. Vencimiento: {{vencimiento}}. Monto: {{monto}}. {{link_pago}}',
        consented: true,
        forceSend: true,
        relatedEntityType: 'invoice',
        relatedEntityId: invoice.id,
        metadata: {
          attachmentUrl: url,
          templateName: 'invoice_available',
          templateLanguage: locale,
          templateParameters: [
            recipient.name,
            snapshot.invoice.invoiceNumber,
            dueDate,
            amount,
          ],
        },
      },
      manager,
    );
  }
}
