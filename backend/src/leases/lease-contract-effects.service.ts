import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { processDocumentEffects } from '../common/helpers/document-effects-outbox';
import { Lease } from './entities/lease.entity';
import { PdfService } from './pdf.service';

@Injectable()
export class LeaseContractEffectsService {
  private readonly logger = new Logger(LeaseContractEffectsService.name);
  constructor(
    private readonly db: DataSource,
    private readonly pdf: PdfService,
  ) {}
  processDue() {
    return processDocumentEffects(
      this.db,
      'lease_contract',
      this.logger,
      (manager, leaseId, companyId) => this.render(manager, leaseId, companyId),
    );
  }
  private async render(
    manager: EntityManager,
    leaseId: string,
    companyId: string,
  ) {
    const [event] = await manager.query(
      `SELECT snapshot,requested_by,document_id FROM lease_contract_effects_outbox WHERE lease_id=$1 AND company_id=$2`,
      [leaseId, companyId],
    );
    if (!event || event.document_id)
      throw new Error('Contract job is unavailable or already has an artifact');
    const lease = await manager.getRepository(Lease).findOne({
      where: { id: leaseId, companyId },
      withDeleted: true,
      lock: { mode: 'pessimistic_write' },
    });
    if (!lease) throw new Error('Contract company mismatch');
    const source = event.snapshot as {
      text: string;
      format: 'plain_text' | 'html';
      locale: string;
      confirmedAt: string;
      version: number;
    };
    if (
      !source.text?.trim() ||
      !['plain_text', 'html'].includes(source.format) ||
      !Number.isFinite(Date.parse(source.confirmedAt))
    )
      throw new Error('Invalid confirmed contract snapshot');
    const document = await this.pdf.generateContract(
      {
        id: leaseId,
        companyId,
        confirmedAt: new Date(source.confirmedAt),
        versionNumber: source.version,
        tenant: { user: { language: source.locale } },
      } as Lease,
      event.requested_by,
      source.text,
      source.format,
      manager,
    );
    await manager.query(
      'UPDATE lease_contract_effects_outbox SET document_id=$2 WHERE lease_id=$1 AND company_id=$3',
      [leaseId, document.id, companyId],
    );
    await manager
      .getRepository(Lease)
      .update({ id: leaseId, companyId }, { contractPdfUrl: document.fileUrl });
  }
}
