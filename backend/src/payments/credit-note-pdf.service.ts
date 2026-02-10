import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditNote } from './entities/credit-note.entity';
import { Invoice } from './entities/invoice.entity';
import {
  Document,
  DocumentStatus,
  DocumentType,
} from '../documents/entities/document.entity';
import { generateCreditNotePdf } from './templates/credit-note-template';

@Injectable()
export class CreditNotePdfService {
  constructor(
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    private readonly i18n: I18nService,
  ) {}

  async generate(creditNote: CreditNote, invoice: Invoice): Promise<string> {
    const lang = invoice.lease?.tenant?.user?.language || 'es';
    const pdfBuffer = await generateCreditNotePdf(
      creditNote,
      invoice,
      this.i18n,
      lang,
    );

    const document = await this.documentsRepository.save(
      this.documentsRepository.create({
        companyId: creditNote.companyId,
        entityType: 'credit_note',
        entityId: creditNote.id,
        documentType: DocumentType.OTHER,
        name: `nota-credito-${creditNote.noteNumber}.pdf`,
        fileUrl: 'db://document/pending',
        fileData: pdfBuffer,
        fileMimeType: 'application/pdf',
        fileSize: pdfBuffer.length,
        status: DocumentStatus.APPROVED,
      }),
    );
    document.fileUrl = `db://document/${document.id}`;
    await this.documentsRepository.save(document);

    return document.fileUrl;
  }
}
