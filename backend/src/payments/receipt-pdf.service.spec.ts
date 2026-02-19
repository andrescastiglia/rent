import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { Document } from '../documents/entities/document.entity';
import { ReceiptPdfService } from './receipt-pdf.service';
import { PaymentDocumentTemplatesService } from './payment-document-templates.service';
import { PaymentDocumentTemplateType } from './entities/payment-document-template.entity';

jest.mock('./templates/receipt-template', () => ({
  generateReceiptPdf: jest.fn(),
}));
jest.mock('./templates/document-template-renderer', () => ({
  renderDocumentTemplate: jest.fn(),
}));
jest.mock('./templates/custom-document-pdf', () => ({
  generateCustomDocumentPdf: jest.fn(),
}));

import { generateReceiptPdf } from './templates/receipt-template';
import { renderDocumentTemplate } from './templates/document-template-renderer';
import { generateCustomDocumentPdf } from './templates/custom-document-pdf';

describe('ReceiptPdfService', () => {
  let service: ReceiptPdfService;
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
      t: jest.fn().mockResolvedValue('Recibo'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptPdfService,
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

    service = module.get(ReceiptPdfService);
    jest.clearAllMocks();
  });

  it('genera con template activo y resume items con descuento', async () => {
    templatesService.findActiveTemplate.mockResolvedValue({
      templateBody: '<p>{{receipt.number}}</p>',
    });
    (renderDocumentTemplate as jest.Mock).mockReturnValue('<p>REC-1</p>');
    (generateCustomDocumentPdf as jest.Mock).mockResolvedValue(
      Buffer.from('pdf-template-r'),
    );

    documentsRepository.save
      .mockResolvedValueOnce({ id: 'doc-r-1' })
      .mockResolvedValueOnce({
        id: 'doc-r-1',
        fileUrl: 'db://document/doc-r-1',
      });

    const result = await service.generate(
      {
        id: 'rec-1',
        receiptNumber: 'REC-1',
        issuedAt: new Date('2026-01-02'),
        amount: 100,
        currencyCode: 'BRL',
      } as any,
      {
        id: 'pay-1',
        companyId: 'company-1',
        paymentDate: new Date('2026-01-02'),
        amount: 100,
        method: 'transfer',
        reference: 'abc',
        notes: 'nota',
        items: [
          { description: 'Alquiler', amount: 100, quantity: 1, type: 'charge' },
          {
            description: 'Bonificacion',
            amount: 10,
            quantity: 1,
            type: 'discount',
          },
        ],
        tenantAccount: {
          lease: {
            tenant: {
              user: {
                firstName: 'T',
                lastName: 'U',
                email: 't@u.com',
                language: 'pt',
              },
            },
            property: {
              name: 'Casa',
              addressStreet: 'Rua',
              addressNumber: '77',
              addressCity: 'SP',
            },
          },
        },
      } as any,
    );

    expect(templatesService.findActiveTemplate).toHaveBeenCalledWith(
      'company-1',
      PaymentDocumentTemplateType.RECEIPT,
    );
    expect(i18n.t).toHaveBeenCalledWith('payment.title', { lang: 'pt' });
    expect(renderDocumentTemplate).toHaveBeenCalled();
    expect(generateCustomDocumentPdf).toHaveBeenCalledWith(
      'Recibo REC-1',
      '<p>REC-1</p>',
      'Recibo ID: rec-1',
    );
    expect(generateReceiptPdf).not.toHaveBeenCalled();
    expect(result).toBe('db://document/doc-r-1');
  });

  it('genera con template por defecto y fallbacks de idioma/currency/optional fields', async () => {
    templatesService.findActiveTemplate.mockResolvedValue(null);
    (generateReceiptPdf as jest.Mock).mockResolvedValue(
      Buffer.from('pdf-default-r'),
    );

    documentsRepository.save
      .mockResolvedValueOnce({ id: 'doc-r-2' })
      .mockResolvedValueOnce({
        id: 'doc-r-2',
        fileUrl: 'db://document/doc-r-2',
      });

    const result = await service.generate(
      {
        id: 'rec-2',
        receiptNumber: 'REC-2',
        issuedAt: new Date('2026-03-02'),
        amount: 20,
        currencyCode: 'EUR',
      } as any,
      {
        id: 'pay-2',
        companyId: 'company-1',
        paymentDate: new Date('2026-03-02'),
        amount: 20,
        method: 'cash',
        items: [],
      } as any,
    );

    expect(generateReceiptPdf).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rec-2' }),
      expect.objectContaining({ id: 'pay-2' }),
      i18n,
      'es',
    );
    expect(renderDocumentTemplate).not.toHaveBeenCalled();
    expect(generateCustomDocumentPdf).not.toHaveBeenCalled();
    expect(result).toBe('db://document/doc-r-2');
  });
});
