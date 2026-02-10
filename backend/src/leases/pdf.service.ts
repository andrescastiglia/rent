import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    private documentsRepository: Repository<Document>,
    private readonly i18n: I18nService,
  ) {}

  async generateContract(
    lease: Lease,
    _userId: string,
    contractText?: string,
  ): Promise<Document> {
    // Obtener idioma preferido del usuario o default
    const lang = lease.tenant?.user?.language || 'es';
    // Generate PDF buffer
    const pdfBuffer = await generateContractPdf(
      lease,
      this.i18n,
      lang,
      contractText,
    );

    // Create document record
    const document = await this.documentsRepository.save(
      this.documentsRepository.create({
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
      }),
    );

    document.fileUrl = `db://document/${document.id}`;
    return this.documentsRepository.save(document);
  }

  async getContractDocument(leaseId: string): Promise<Document | null> {
    return this.documentsRepository.findOne({
      where: {
        entityType: 'lease',
        entityId: leaseId,
        documentType: DocumentType.LEASE_CONTRACT,
      },
      order: { createdAt: 'DESC' },
    });
  }
}
