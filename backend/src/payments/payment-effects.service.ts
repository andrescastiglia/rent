import { processDocumentEffects } from '../common/helpers/document-effects-outbox';
import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CommunicationsService } from '../communications/communications.service';
import {
  CommunicationChannel,
  CommunicationEvent,
  CommunicationRecipientRole,
} from '../communications/entities/communication-template.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { Receipt } from './entities/receipt.entity';
import { CreditNote, CreditNoteStatus } from './entities/credit-note.entity';
import { ReceiptPdfService } from './receipt-pdf.service';
import { CreditNotePdfService } from './credit-note-pdf.service';

@Injectable()
export class PaymentEffectsService {
  private readonly logger = new Logger(PaymentEffectsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly receiptPdf: ReceiptPdfService,
    private readonly creditNotePdf: CreditNotePdfService,
    private readonly communications: CommunicationsService,
  ) {}

  processDue() {
    return processDocumentEffects(
      this.dataSource,
      'payment',
      this.logger,
      (manager, paymentId, companyId) =>
        this.render(manager, paymentId, companyId),
    );
  }

  private async render(
    manager: EntityManager,
    paymentId: string,
    companyId: string,
  ) {
    const repository = manager.getRepository(Payment);
    // Serialize with cancellation so an unprocessed cancelled payment sends no receipt.
    const locked = await repository.findOne({
      where: { id: paymentId, companyId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!locked) throw new Error('Payment is unavailable');
    if (locked.status === PaymentStatus.CANCELLED) return;
    if (locked.status !== PaymentStatus.COMPLETED)
      throw new Error('Payment is not completed');
    const payment = await repository.findOneOrFail({
      where: { id: paymentId, companyId },
      relations: [
        'items',
        'tenant',
        'tenant.user',
        'tenantAccount',
        'tenantAccount.lease',
        'tenantAccount.lease.tenant',
        'tenantAccount.lease.tenant.user',
        'tenantAccount.lease.property',
      ],
    });
    await this.renderReceipt(manager, payment);
    await this.renderCreditNotes(manager, paymentId, companyId);
  }

  private async renderReceipt(manager: EntityManager, payment: Payment) {
    const { id: paymentId, companyId } = payment;
    const receipts = manager.getRepository(Receipt);
    const receipt = await receipts.findOneOrFail({
      where: { paymentId, companyId },
    });
    if (!receipt.pdfUrl && !receipt.cancelledAt) {
      receipt.pdfUrl = await this.receiptPdf.generate(
        receipt,
        payment,
        manager,
      );
      receipt.pdfGeneratedAt = new Date();
      await receipts.save(receipt);
      const tenant = payment.tenant ?? payment.tenantAccount?.lease?.tenant;
      const user = tenant?.user;
      if (
        tenant &&
        user?.phone &&
        (!tenant.preferredContactChannel ||
          tenant.preferredContactChannel === CommunicationChannel.WHATSAPP)
      ) {
        await this.communications.dispatchEvent(
          {
            companyId,
            event: CommunicationEvent.PAYMENT_RECEIVED,
            recipientRole: CommunicationRecipientRole.TENANT,
            recipientId: tenant.id,
            channel: CommunicationChannel.WHATSAPP,
            recipient: user.phone,
            locale: user.language ?? 'es',
            variables: {
              nombre: [user.firstName, user.lastName].filter(Boolean).join(' '),
              monto: Number(payment.amount).toFixed(2),
              moneda: payment.currencyCode,
              recibo: receipt.receiptNumber,
              saldo: payment.tenantAccount?.balance ?? null,
              link_recibo: receipt.pdfUrl,
            },
            fallbackSubject: `Pago recibido - ${receipt.receiptNumber}`,
            fallbackBody:
              'Hola {{nombre}}, confirmamos tu pago de {{moneda}} {{monto}}. Recibo {{recibo}}: {{link_recibo}}',
            consented: Boolean(tenant.contactConsent && user.whatsappEnabled),
            relatedEntityType: 'payment',
            relatedEntityId: paymentId,
            metadata: { receiptId: receipt.id, attachmentUrl: receipt.pdfUrl },
          },
          manager,
        );
      }
    }
  }

  private async renderCreditNotes(
    manager: EntityManager,
    paymentId: string,
    companyId: string,
  ) {
    const notes = manager.getRepository(CreditNote);
    for (const locked of await notes.find({
      where: { paymentId, companyId, status: CreditNoteStatus.ISSUED },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    })) {
      // Another payment can revoke this note; retain its lock through PDF persistence.
      const note = await notes.findOneOrFail({
        where: { id: locked.id, companyId, status: CreditNoteStatus.ISSUED },
        relations: [
          'invoice',
          'invoice.lease',
          'invoice.lease.tenant',
          'invoice.lease.tenant.user',
        ],
      });
      if (note.pdfUrl) continue;
      if (note.invoice?.companyId !== companyId)
        throw new Error('Credit note invoice is unavailable');
      note.pdfUrl = await this.creditNotePdf.generate(
        note,
        note.invoice,
        manager,
      );
      await notes.save(note);
      const tenant = note.invoice.lease?.tenant;
      const user = tenant?.user;
      if (
        !tenant ||
        !user?.phone ||
        (tenant.preferredContactChannel &&
          tenant.preferredContactChannel !== CommunicationChannel.WHATSAPP)
      )
        continue;
      const amount = `${note.currencyCode} ${Number(note.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
      await this.communications.dispatchEvent(
        {
          companyId,
          event: CommunicationEvent.CREDIT_NOTE_ISSUED,
          recipientRole: CommunicationRecipientRole.TENANT,
          recipientId: tenant.id,
          channel: CommunicationChannel.WHATSAPP,
          recipient: user.phone,
          locale: user.language ?? 'es',
          variables: {},
          fallbackBody: `Se emitió la nota de crédito ${note.noteNumber} por ${amount}.`,
          consented: Boolean(tenant.contactConsent && user.whatsappEnabled),
          forceSend: true,
          skipTemplateLookup: true,
          relatedEntityType: 'payment',
          relatedEntityId: paymentId,
          metadata: {
            creditNoteId: note.id,
            attachmentUrl: note.pdfUrl,
            templateName: 'credit_note_issued',
            templateLanguage: user.language ?? 'es',
            templateParameters: [note.noteNumber, amount],
          },
        },
        manager,
      );
    }
  }
}
