import { generateReceiptPdf } from './receipt-template';

describe('generateReceiptPdf', () => {
  const i18n = {
    t: jest.fn(async (key: string) => key),
  } as any;

  it('generates a receipt with tenant, items and notes', async () => {
    const buffer = await generateReceiptPdf(
      {
        id: 'rec-1',
        receiptNumber: 'REC-1',
        issuedAt: new Date('2025-01-01'),
        amount: 900,
        currencyCode: 'ARS',
      } as any,
      {
        paymentDate: new Date('2025-01-01'),
        method: 'cash',
        reference: 'ref-1',
        notes: 'nota interna',
        items: [
          {
            description: 'Alquiler',
            amount: 1000,
            quantity: 1,
            type: 'charge',
          },
          {
            description: 'Descuento',
            amount: 100,
            quantity: 1,
            type: 'discount',
          },
        ],
        tenantAccount: {
          lease: {
            tenant: {
              user: {
                firstName: 'Tenant',
                lastName: 'User',
                email: 'tenant@test.dev',
              },
            },
          },
        },
      } as any,
      i18n,
      'es',
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    expect(i18n.t).toHaveBeenCalledWith('payment.title', { lang: 'es' });
  });

  it('generates a receipt without tenant, items and notes', async () => {
    const buffer = await generateReceiptPdf(
      {
        id: 'rec-2',
        receiptNumber: 'REC-2',
        issuedAt: new Date('2025-02-01'),
        amount: 10,
        currencyCode: 'EUR',
      } as any,
      {
        paymentDate: new Date('2025-02-01'),
        method: 'unknown_method',
        reference: null,
        items: [],
      } as any,
      i18n,
      'pt',
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
