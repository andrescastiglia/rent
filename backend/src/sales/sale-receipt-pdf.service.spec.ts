import { SaleReceiptPdfService } from './sale-receipt-pdf.service';

jest.mock('./templates/sale-receipt-template', () => ({
  generateSaleReceiptPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
}));

jest.mock('../config/s3.config', () => ({
  getS3Config: () => ({ send: jest.fn().mockResolvedValue({}) }),
  S3_BUCKET_NAME: 'test-bucket',
}));

describe('SaleReceiptPdfService', () => {
  let service: SaleReceiptPdfService;
  let documentsRepository: any;

  beforeEach(() => {
    documentsRepository = {
      create: jest.fn((dto: any) => dto),
      save: jest.fn((entity: any) => ({ id: 'doc-1', ...entity })),
    };
    const configService = { get: jest.fn() } as any;
    service = new SaleReceiptPdfService(documentsRepository, configService);
  });

  it('generates PDF, uploads to S3, and saves document record', async () => {
    const receipt = { id: 'rec-1', receiptNumber: 'SR-001' } as any;
    const agreement = { companyId: 'company-1' } as any;

    const result = await service.generate(receipt, agreement);

    expect(result).toContain('sale-receipts/rec-1/');
    expect(documentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        entityType: 'sale_receipt',
        entityId: 'rec-1',
        name: 'recibo-venta-SR-001.pdf',
        fileMimeType: 'application/pdf',
      }),
    );
    expect(documentsRepository.save).toHaveBeenCalled();
  });
});
