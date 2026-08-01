import { buildInvoicePaymentUrl } from './invoice-payment-link';

describe('buildInvoicePaymentUrl', () => {
  it('builds a localized MercadoPago invoice link', () => {
    expect(
      buildInvoicePaymentUrl('https://rent.example.com', 'invoice-1', 'pt'),
    ).toBe('https://rent.example.com/pt/invoices/invoice-1?pay=mercadopago');
  });

  it('uses the first configured frontend origin and falls back to Spanish', () => {
    expect(
      buildInvoicePaymentUrl(
        'https://rent.example.com, https://admin.example.com',
        'invoice/with spaces',
        'fr',
      ),
    ).toBe(
      'https://rent.example.com/es/invoices/invoice%2Fwith%20spaces?pay=mercadopago',
    );
  });

  it('returns null for missing or invalid frontend URLs', () => {
    expect(buildInvoicePaymentUrl(undefined, 'invoice-1')).toBeNull();
    expect(buildInvoicePaymentUrl('not a url', 'invoice-1')).toBeNull();
  });
});
