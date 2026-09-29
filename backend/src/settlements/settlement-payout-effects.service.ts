import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createHash } from 'node:crypto';
import { processDocumentEffects } from '../common/helpers/document-effects-outbox';
import {
  Document,
  DocumentStatus,
  DocumentType,
} from '../documents/entities/document.entity';
import { CommunicationsService } from '../communications/communications.service';
import {
  CommunicationChannel,
  CommunicationEvent,
  CommunicationRecipientRole,
} from '../communications/entities/communication-template.entity';
import { ProviderConfigService } from '../integrations/provider-config.service';
import {
  SettlementPayoutReceiptPdfService,
  PayoutReceiptSnapshot,
} from './settlement-payout-receipt-pdf.service';

export async function enqueuePayoutReceipt(
  manager: EntityManager,
  movementId: string,
) {
  const [event] = await manager.query(
    `WITH inserted AS (
      INSERT INTO settlement_payout_effects_outbox(company_id,movement_id,snapshot)
      SELECT m.company_id,m.id,jsonb_build_object(
        'version',1,'movementId',m.id,'settlementId',s.id,'ownerId',o.id,
        'ownerName',concat_ws(' ',u.first_name,u.last_name),'companyName',c.name,
        'period',s.period,'kind',m.kind,'amount',m.amount::text,'currency',m.currency,
        'grossAmount',s.gross_amount::text,'commissionAmount',s.commission_amount::text,
        'withholdingsAmount',s.withholdings_amount::text,'transactionId',m.transaction_id,
        'providerUpdatedAt',m.provider_updated_at)
      FROM settlement_payout_movements m JOIN settlements s ON s.id=m.settlement_id
      JOIN owners o ON o.id=s.owner_id AND o.company_id=m.company_id
      JOIN users u ON u.id=o.user_id AND u.company_id=m.company_id
      JOIN companies c ON c.id=m.company_id
      WHERE m.id=$1::uuid ON CONFLICT(movement_id) DO NOTHING RETURNING id
    ) SELECT id FROM inserted`,
    [movementId],
  );
  if (!event) throw new Error('Payout receipt snapshot could not be persisted');
}
@Injectable()
export class SettlementPayoutEffectsService {
  private readonly logger = new Logger(SettlementPayoutEffectsService.name);
  constructor(
    private readonly db: DataSource,
    private readonly pdf: SettlementPayoutReceiptPdfService,
    private readonly communications: CommunicationsService,
    private readonly config: ProviderConfigService,
  ) {}
  processDue() {
    if (!this.config.enabled('MERCADOPAGO_PAYOUTS'))
      return Promise.resolve({
        processed: 0,
        completed: 0,
        failed: 0,
        queued: 0,
        deadLetter: 0,
        disabled: true,
      });
    return processDocumentEffects(
      this.db,
      'settlement_payout',
      this.logger,
      (manager, id, companyId) => this.render(manager, id, companyId),
    );
  }
  private async render(
    manager: EntityManager,
    movementId: string,
    companyId: string,
  ) {
    const [event] = await manager.query(
      `SELECT e.id,e.snapshot,m.document_id FROM settlement_payout_effects_outbox e
       JOIN settlement_payout_movements m ON m.id=e.movement_id AND m.company_id=e.company_id
       WHERE e.movement_id=$1::uuid AND e.company_id=$2::uuid`,
      [movementId, companyId],
    );
    if (!event) throw new Error('Payout receipt event not found');
    if (event.document_id) return;
    const snapshot = event.snapshot as PayoutReceiptSnapshot;
    if (snapshot.version !== 1 || snapshot.movementId !== movementId)
      throw new Error('Invalid payout receipt snapshot');
    const [settlement] = await manager.query(
      'SELECT status FROM settlements WHERE id=$1::uuid FOR UPDATE',
      [snapshot.settlementId],
    );
    if (!settlement) throw new Error('Settlement not found');
    const buffer = await this.pdf.generate(snapshot);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const fileUrl = `db://document/${event.id}`;
    await manager.getRepository(Document).save(
      manager.getRepository(Document).create({
        id: event.id,
        companyId,
        entityType: 'owner_settlement',
        entityId: snapshot.settlementId,
        documentType: DocumentType.OTHER,
        status: DocumentStatus.APPROVED,
        name: `liquidacion-${snapshot.kind}-${movementId}.pdf`,
        fileUrl,
        fileData: buffer,
        fileMimeType: 'application/pdf',
        fileSize: buffer.length,
        metadata: {
          source: 'mercadopago_payout',
          payoutMovementId: movementId,
          kind: snapshot.kind,
          version: 1,
          sha256: checksum,
          providerUpdatedAt: snapshot.providerUpdatedAt,
        },
      }),
    );
    await manager.query(
      'UPDATE settlement_payout_movements SET document_id=$2::uuid WHERE id=$1::uuid AND company_id=$3::uuid',
      [movementId, event.id, companyId],
    );
    // Keep the historical document, but do not announce a payment that has already reversed.
    if (snapshot.kind === 'transfer' && settlement.status !== 'completed')
      return;
    const [owner] = await manager.query(
      `SELECT o.contact_consent,o.preferred_contact_channel,u.phone,u.whatsapp_enabled,u.language
       FROM owners o JOIN users u ON u.id=o.user_id AND u.company_id=o.company_id
       WHERE o.id=$1::uuid AND o.company_id=$2::uuid AND o.deleted_at IS NULL AND u.deleted_at IS NULL`,
      [snapshot.ownerId, companyId],
    );
    if (!owner?.phone || owner.preferred_contact_channel !== 'whatsapp') return;
    const reversal = snapshot.kind === 'reversal';
    await this.communications.dispatchEvent(
      {
        companyId,
        event: reversal
          ? CommunicationEvent.SETTLEMENT_REVERSED
          : CommunicationEvent.SETTLEMENT_PAID,
        recipientRole: CommunicationRecipientRole.OWNER,
        recipientId: snapshot.ownerId,
        channel: CommunicationChannel.WHATSAPP,
        recipient: owner.phone,
        locale: owner.language ?? 'es',
        variables: {
          nombre: snapshot.ownerName,
          periodo_liquidacion: snapshot.period,
          monto_neto: snapshot.amount,
          monto_bruto: snapshot.grossAmount,
          comisiones: snapshot.commissionAmount,
          retenciones: snapshot.withholdingsAmount,
          moneda: snapshot.currency,
          fecha_movimiento: snapshot.providerUpdatedAt,
          referencia: snapshot.transactionId,
          link_liquidacion: fileUrl,
        },
        fallbackSubject: reversal
          ? 'Devolución de transferencia de liquidación'
          : 'Acreditación de liquidación',
        fallbackBody: reversal
          ? 'Hola {{nombre}}, Mercado Pago informó la devolución completa de {{moneda}} {{monto_neto}} de la liquidación {{periodo_liquidacion}} el {{fecha_movimiento}}. Referencia: {{referencia}}. Comprobante: {{link_liquidacion}}'
          : 'Hola {{nombre}}, Mercado Pago confirmó la acreditación de {{moneda}} {{monto_neto}} de la liquidación {{periodo_liquidacion}} el {{fecha_movimiento}}. Referencia: {{referencia}}. Comprobante: {{link_liquidacion}}',
        consented: Boolean(owner.contact_consent && owner.whatsapp_enabled),
        relatedEntityType: 'owner',
        relatedEntityId: snapshot.ownerId,
        metadata: {
          settlementId: snapshot.settlementId,
          payoutMovementId: movementId,
          payoutMovementKind: snapshot.kind,
          attachmentUrl: fileUrl,
        },
      },
      manager,
    );
  }
  async download(settlementId: string, movementId: string, companyId: string) {
    const [row] = await this.db.query(
      `SELECT d.file_data,d.metadata->>'sha256' AS checksum FROM settlement_payout_movements m
       JOIN documents d ON d.id=m.document_id AND d.company_id=m.company_id AND d.entity_type='owner_settlement' AND d.entity_id=m.settlement_id AND d.deleted_at IS NULL AND d.status='approved'
       WHERE m.id=$1::uuid AND m.settlement_id=$2::uuid AND m.company_id=$3::uuid`,
      [movementId, settlementId, companyId],
    );
    if (!row?.file_data)
      throw new NotFoundException('Payout receipt not found');
    if (
      createHash('sha256').update(row.file_data).digest('hex') !== row.checksum
    )
      throw new ConflictException('Payout receipt integrity check failed');
    return {
      buffer: row.file_data as Buffer,
      checksum: row.checksum as string,
      filename: `liquidacion-${movementId}.pdf`,
    };
  }
}
