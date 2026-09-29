import { LeaseContractStatusDto } from './dto/lease-contract-status.dto';
import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import { Lease } from './entities/lease.entity';
import {
  Document,
  DocumentType,
  DocumentStatus,
} from '../documents/entities/document.entity';
import { generateContractPdf } from './templates/contract-template';

@Injectable()
export class PdfService {
  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    private readonly i18n: I18nService,
  ) {}

  async generateContract(
    lease: Lease,
    _userId: string,
    contractText?: string,
    contractFormat: 'plain_text' | 'html' = 'plain_text',
    manager?: EntityManager,
  ): Promise<Document> {
    const documents =
      manager?.getRepository(Document) ?? this.documentsRepository;
    // Obtener idioma preferido del usuario o default
    const lang = lease.tenant?.user?.language || 'es';
    // Generate PDF buffer
    const pdfBuffer = await generateContractPdf(
      lease,
      this.i18n,
      lang,
      contractText,
      contractFormat,
      lease.confirmedAt ?? undefined,
    );

    // Create document record
    const document = await documents.save(
      documents.create({
        companyId: lease.companyId,
        entityType: 'lease',
        entityId: lease.id,
        documentType: DocumentType.LEASE_CONTRACT,
        name: `contrato-${lease.id}.pdf`,
        fileUrl: 'db://document/pending',
        fileData: pdfBuffer,
        fileMimeType: 'application/pdf',
        fileSize: pdfBuffer.length,
        status: DocumentStatus.APPROVED,
        metadata: {
          source: 'lease_contract',
          sha256: createHash('sha256').update(pdfBuffer).digest('hex'),
          version: lease.versionNumber ?? 1,
          confirmedAt: lease.confirmedAt ?? null,
        },
      }),
    );

    document.fileUrl = `db://document/${document.id}`;
    return documents.save(document);
  }

  async getContractDocument(
    leaseId: string,
    companyId: string,
  ): Promise<Document | null> {
    const [event] = await this.documentsRepository.manager.query(
      'SELECT document_id FROM lease_contract_effects_outbox WHERE lease_id=$1 AND company_id=$2',
      [leaseId, companyId],
    );
    if (event && !event.document_id) return null;
    return this.documentsRepository.findOne({
      where: {
        ...(event ? { id: event.document_id as string } : {}),
        status: DocumentStatus.APPROVED,
        companyId,
        entityType: 'lease',
        entityId: leaseId,
        documentType: DocumentType.LEASE_CONTRACT,
      },
      order: { createdAt: 'DESC' },
    });
  }
  async getContractStatus(
    leaseId: string,
    companyId: string,
  ): Promise<LeaseContractStatusDto> {
    const [event] = await this.documentsRepository.manager.query(
      'SELECT status FROM lease_contract_effects_outbox WHERE lease_id=$1 AND company_id=$2',
      [leaseId, companyId],
    );
    const document = await this.getContractDocument(leaseId, companyId);
    return {
      status: event?.status ?? (document ? 'completed' : 'unavailable'),
      available: !!document,
    };
  }
}
