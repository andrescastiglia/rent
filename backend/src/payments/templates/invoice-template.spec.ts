import { generateInvoicePdf } from './invoice-template';

describe('generateInvoicePdf', () => {
  const i18n = {
    t: jest.fn(async (key: string) => key),
  } as any;

  it('generates a PDF with optional sections present', async () => {
    const buffer = await generateInvoicePdf(
      {
        id: 'inv-1',
        invoiceNumber: 'FAC-1',
        issuedAt: new Date('2025-01-01'),
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        dueDate: new Date('2025-02-10'),
        subtotal: 1000,
        lateFee: 100,
        adjustments: -50,
        total: 1050,
        currencyCode: 'ARS',
        status: 'pending',
        owner: {
          user: {
            firstName: 'Owner',
            lastName: 'User',
            email: 'owner@test.dev',
          },
        },
        lease: {
          tenant: {
            user: {
              firstName: 'Tenant',
              lastName: 'User',
              email: 'tenant@test.dev',
            },
          },
          property: {
            addressStreet: 'Calle',
            addressNumber: '123',
            addressCity: 'CABA',
          },
        },
      } as any,
      i18n,
      'es',
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    expect(i18n.t).toHaveBeenCalledWith('invoice.title', { lang: 'es' });
  });

  it('generates a PDF without optional property/late fee/adjustments', async () => {
    const buffer = await generateInvoicePdf(
      {
        id: 'inv-2',
        invoiceNumber: 'FAC-2',
        issuedAt: null,
        periodStart: new Date('2025-02-01'),
        periodEnd: new Date('2025-02-28'),
        dueDate: new Date('2025-03-10'),
        subtotal: 500,
        lateFee: 0,
        adjustments: 0,
        total: 500,
        currencyCode: 'EUR',
        status: 'custom_status',
      } as any,
      i18n,
      'en',
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
