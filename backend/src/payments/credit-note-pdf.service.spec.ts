import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { Document } from '../documents/entities/document.entity';
import { CreditNotePdfService } from './credit-note-pdf.service';
import { PaymentDocumentTemplatesService } from './payment-document-templates.service';
import { PaymentDocumentTemplateType } from './entities/payment-document-template.entity';

jest.mock('./templates/credit-note-template', () => ({
  generateCreditNotePdf: jest.fn(),
}));
jest.mock('./templates/document-template-renderer', () => ({
  renderDocumentTemplate: jest.fn(),
}));
jest.mock('./templates/custom-document-pdf', () => ({
  generateCustomDocumentPdf: jest.fn(),
}));

import { generateCreditNotePdf } from './templates/credit-note-template';
import { renderDocumentTemplate } from './templates/document-template-renderer';
import { generateCustomDocumentPdf } from './templates/custom-document-pdf';

describe('CreditNotePdfService', () => {
  let service: CreditNotePdfService;
  let documentsRepository: {
    create: jest.Mock;
    save: jest.Mock;
  };
  let templatesService: {
    findActiveTemplate: jest.Mock;
  };
  let i18n: {
    t: jest.Mock;
  };

  beforeEach(async () => {
    documentsRepository = {
      create: jest.fn((v) => v),
      save: jest.fn(),
    };
    templatesService = {
      findActiveTemplate: jest.fn(),
    };
    i18n = {
      t: jest.fn().mockResolvedValue('Nota de crédito'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditNotePdfService,
        {
          provide: getRepositoryToken(Document),
          useValue: documentsRepository,
        },
        {
          provide: I18nService,
          useValue: i18n,
        },
        {
          provide: PaymentDocumentTemplatesService,
          useValue: templatesService,
        },
      ],
    }).compile();

    service = module.get(CreditNotePdfService);
    jest.clearAllMocks();
  });

  it('uses active template, custom renderer and persists document', async () => {
    templatesService.findActiveTemplate.mockResolvedValue({
      templateBody: '<h1>{{creditNote.number}}</h1>',
    });
    (renderDocumentTemplate as jest.Mock).mockReturnValue('<h1>NC-1</h1>');
    (generateCustomDocumentPdf as jest.Mock).mockResolvedValue(
      Buffer.from('pdf-template-cn'),
    );

    documentsRepository.save
      .mockResolvedValueOnce({ id: 'doc-cn-1' })
      .mockResolvedValueOnce({
        id: 'doc-cn-1',
        fileUrl: 'db://document/doc-cn-1',
      });

    const result = await service.generate(
      {
        id: 'cn-1',
        companyId: 'company-1',
        noteNumber: 'NC-1',
        issuedAt: new Date('2026-02-01'),
        amount: 100,
        currencyCode: 'ARS',
      } as any,
      {
        id: 'inv-1',
        invoiceNumber: 'FAC-1',
        dueDate: new Date('2026-02-10'),
        total: 100,
        currencyCode: 'ARS',
        lease: {
          tenant: {
            user: { firstName: 'Ana', lastName: 'Diaz', language: 'es' },
          },
        },
      } as any,
    );

    expect(templatesService.findActiveTemplate).toHaveBeenCalledWith(
      'company-1',
      PaymentDocumentTemplateType.CREDIT_NOTE,
    );
    expect(i18n.t).toHaveBeenCalledWith('creditNote.header', { lang: 'es' });
    expect(renderDocumentTemplate).toHaveBeenCalled();
    expect(generateCustomDocumentPdf).toHaveBeenCalledWith(
      'Nota de crédito NC-1',
      '<h1>NC-1</h1>',
      'Nota de crédito ID: cn-1',
    );
    expect(generateCreditNotePdf).not.toHaveBeenCalled();
    expect(documentsRepository.save).toHaveBeenCalledTimes(2);
    expect(result).toBe('db://document/doc-cn-1');
  });

  it('falls back to default template generator and default language', async () => {
    templatesService.findActiveTemplate.mockResolvedValue(null);
    (generateCreditNotePdf as jest.Mock).mockResolvedValue(
      Buffer.from('pdf-default-cn'),
    );

    documentsRepository.save
      .mockResolvedValueOnce({ id: 'doc-cn-2' })
      .mockResolvedValueOnce({
        id: 'doc-cn-2',
        fileUrl: 'db://document/doc-cn-2',
      });

    const result = await service.generate(
      {
        id: 'cn-2',
        companyId: 'company-1',
        noteNumber: 'NC-2',
        issuedAt: new Date('2026-02-02'),
        amount: 20,
        currencyCode: 'USD',
      } as any,
      {
        id: 'inv-2',
        invoiceNumber: 'FAC-2',
        dueDate: new Date('2026-02-20'),
        total: 20,
        currencyCode: 'USD',
      } as any,
    );

    expect(generateCreditNotePdf).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cn-2' }),
      expect.objectContaining({ id: 'inv-2' }),
      i18n,
      'es',
    );
    expect(renderDocumentTemplate).not.toHaveBeenCalled();
    expect(generateCustomDocumentPdf).not.toHaveBeenCalled();
    expect(result).toBe('db://document/doc-cn-2');
  });
});
