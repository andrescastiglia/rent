import { SaleReceiptPdfService } from './sale-receipt-pdf.service';

jest.mock('./templates/sale-receipt-template', () => ({
  generateSaleReceiptPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
}));

describe('SaleReceiptPdfService', () => {
  let service: SaleReceiptPdfService;
  let documentsRepository: any;

  beforeEach(() => {
    documentsRepository = {
      create: jest.fn((dto: any) => dto),
      save: jest.fn((entity: any) => ({ id: 'doc-1', ...entity })),
    };
    service = new SaleReceiptPdfService(documentsRepository);
  });

  it('persists PDF bytes and its final database URL in a single save', async () => {
    const receipt = { id: 'rec-1', receiptNumber: 'SR-001' } as any;
    const agreement = { companyId: 'company-1' } as any;

    const result = await service.generate(receipt, agreement);

    expect(result).toMatch(/^db:\/\/document\/[a-f0-9-]{36}$/);
    expect(documentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        entityType: 'sale_receipt',
        entityId: 'rec-1',
        name: 'recibo-venta-SR-001.pdf',
        fileMimeType: 'application/pdf',
        fileData: Buffer.from('pdf'),
        fileSize: 3,
        fileUrl: result,
      }),
    );
    expect(documentsRepository.save).toHaveBeenCalledTimes(1);
  });
});
