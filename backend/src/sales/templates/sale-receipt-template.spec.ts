import { generateSaleReceiptPdf } from './sale-receipt-template';

jest.mock('pdfkit', () => {
  type PdfEventHandler = (...args: unknown[]) => void;

  class MockPdfDocument {
    private handlers: Record<string, PdfEventHandler[]> = {};

    on(event: string, cb: PdfEventHandler) {
      this.handlers[event] = this.handlers[event] || [];
      this.handlers[event].push(cb);
      return this;
    }

    fontSize() {
      return this;
    }

    font() {
      return this;
    }

    text() {
      return this;
    }

    moveDown() {
      return this;
    }

    addPage() {
      return this;
    }

    end() {
      (this.handlers.data || []).forEach((cb) => cb(Buffer.from('pdf')));
      (this.handlers.end || []).forEach((cb) => cb());
      return this;
    }
  }

  return {
    __esModule: true,
    default: MockPdfDocument,
  };
});

describe('generateSaleReceiptPdf', () => {
  it('generates PDF with explicit copy count', async () => {
    const buffer = await generateSaleReceiptPdf(
      {
        receiptNumber: 'R-1',
        installmentNumber: 2,
        paymentDate: new Date('2025-01-01'),
        amount: 1000,
        balanceAfter: 5000,
        overdueAmount: 0,
        copyCount: 1,
      } as any,
      {
        buyerName: 'Buyer Name',
        buyerPhone: '5491112345678',
        currency: 'ARS',
      } as any,
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('generates PDF with default copy count', async () => {
    const buffer = await generateSaleReceiptPdf(
      {
        receiptNumber: 'R-2',
        installmentNumber: 1,
        paymentDate: new Date('2025-02-01'),
        amount: 200,
        balanceAfter: 300,
        overdueAmount: 20,
      } as any,
      {
        buyerName: 'Buyer Name',
        buyerPhone: '5491112345678',
        currency: 'USD',
      } as any,
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
