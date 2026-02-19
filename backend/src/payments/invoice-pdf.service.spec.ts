import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { Document } from '../documents/entities/document.entity';
import { InvoicePdfService } from './invoice-pdf.service';
import { PaymentDocumentTemplatesService } from './payment-document-templates.service';
import { PaymentDocumentTemplateType } from './entities/payment-document-template.entity';

jest.mock('./templates/invoice-template', () => ({
  generateInvoicePdf: jest.fn(),
}));
jest.mock('./templates/document-template-renderer', () => ({
  renderDocumentTemplate: jest.fn(),
}));
jest.mock('./templates/custom-document-pdf', () => ({
  generateCustomDocumentPdf: jest.fn(),
}));

import { generateInvoicePdf } from './templates/invoice-template';
import { renderDocumentTemplate } from './templates/document-template-renderer';
import { generateCustomDocumentPdf } from './templates/custom-document-pdf';

describe('InvoicePdfService', () => {
  let service: InvoicePdfService;
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
      t: jest.fn().mockResolvedValue('Factura'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicePdfService,
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

    service = module.get(InvoicePdfService);
    jest.clearAllMocks();
  });

  it('genera usando template activo y persiste documento', async () => {
    templatesService.findActiveTemplate.mockResolvedValue({
      templateBody: '<h1>{{invoice.number}}</h1>',
    });
    (renderDocumentTemplate as jest.Mock).mockReturnValue('<h1>FAC-1</h1>');
    (generateCustomDocumentPdf as jest.Mock).mockResolvedValue(
      Buffer.from('pdf-template'),
    );

    documentsRepository.save
      .mockResolvedValueOnce({ id: 'doc-1' })
      .mockResolvedValueOnce({ id: 'doc-1', fileUrl: 'db://document/doc-1' });

    const result = await service.generate({
      id: 'inv-1',
      companyId: 'company-1',
      invoiceNumber: 'FAC-1',
      dueDate: new Date('2026-01-10'),
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
      status: 'pending',
      subtotal: 100,
      lateFee: 0,
      adjustments: 0,
      total: 100,
      currencyCode: 'USD',
      owner: {
        user: { firstName: 'Ana', lastName: 'Doe', email: 'a@test.com' },
      },
      lease: {
        tenant: {
          user: {
            firstName: 'Tin',
            lastName: 'Doe',
            email: 't@test.com',
            language: 'en',
          },
        },
        property: {
          name: 'Depto',
          addressStreet: 'Calle',
          addressNumber: '12',
          addressCity: 'CABA',
          addressState: 'BA',
        },
      },
    } as any);

    expect(templatesService.findActiveTemplate).toHaveBeenCalledWith(
      'company-1',
      PaymentDocumentTemplateType.INVOICE,
    );
    expect(i18n.t).toHaveBeenCalledWith('invoice.title', { lang: 'en' });
    expect(renderDocumentTemplate).toHaveBeenCalled();
    expect(generateCustomDocumentPdf).toHaveBeenCalledWith(
      'Factura FAC-1',
      '<h1>FAC-1</h1>',
      'Factura ID: inv-1',
    );
    expect(generateInvoicePdf).not.toHaveBeenCalled();
    expect(documentsRepository.create).toHaveBeenCalled();
    expect(documentsRepository.save).toHaveBeenCalledTimes(2);
    expect(result).toBe('db://document/doc-1');
  });

  it('genera usando template por defecto cuando no hay template activo y usa idioma es por defecto', async () => {
    templatesService.findActiveTemplate.mockResolvedValue(null);
    (generateInvoicePdf as jest.Mock).mockResolvedValue(
      Buffer.from('pdf-default'),
    );

    documentsRepository.save
      .mockResolvedValueOnce({ id: 'doc-2' })
      .mockResolvedValueOnce({ id: 'doc-2', fileUrl: 'db://document/doc-2' });

    const result = await service.generate({
      id: 'inv-2',
      companyId: 'company-1',
      invoiceNumber: 'FAC-2',
      dueDate: new Date('2026-02-10'),
      periodStart: new Date('2026-02-01'),
      periodEnd: new Date('2026-02-28'),
      issuedAt: null,
      status: 'paid',
      subtotal: 200,
      total: 200,
      currencyCode: 'EUR',
    } as any);

    expect(generateInvoicePdf).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inv-2' }),
      i18n,
      'es',
    );
    expect(renderDocumentTemplate).not.toHaveBeenCalled();
    expect(generateCustomDocumentPdf).not.toHaveBeenCalled();
    expect(result).toBe('db://document/doc-2');
  });
});
