import { generateCreditNotePdf } from './credit-note-template';

describe('generateCreditNotePdf', () => {
  it('generates a credit note using explicit reason', async () => {
    const i18n = {
      t: jest.fn(async (key: string) => key),
    } as any;

    const buffer = await generateCreditNotePdf(
      {
        id: 'cn-1',
        noteNumber: 'NC-1',
        issuedAt: new Date('2025-01-15'),
        reason: 'Ajuste manual',
        currencyCode: 'ARS',
        amount: 1234.56,
      } as any,
      {
        invoiceNumber: 'FAC-100',
        dueDate: new Date('2025-01-31'),
        currencyCode: 'ARS',
        total: 4321,
      } as any,
      i18n,
      'es',
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    expect(i18n.t).toHaveBeenCalledWith('creditNote.header', { lang: 'es' });
    expect(i18n.t).not.toHaveBeenCalledWith('creditNote.defaultReason', {
      lang: 'es',
    });
  });

  it('uses default reason when credit note reason is missing', async () => {
    const i18n = {
      t: jest.fn(async (key: string) => key),
    } as any;

    const buffer = await generateCreditNotePdf(
      {
        id: 'cn-2',
        noteNumber: 'NC-2',
        issuedAt: new Date('2025-02-15'),
        reason: '',
        currencyCode: 'USD',
        amount: 300,
      } as any,
      {
        invoiceNumber: 'FAC-101',
        dueDate: new Date('2025-02-28'),
        currencyCode: 'USD',
        total: 1000,
      } as any,
      i18n,
      'en',
    );

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    expect(i18n.t).toHaveBeenCalledWith('creditNote.defaultReason', {
      lang: 'en',
    });
  });

  it('rejects when translation lookup fails', async () => {
    const i18n = {
      t: jest.fn(async () => {
        throw new Error('i18n failure');
      }),
    } as any;

    await expect(
      generateCreditNotePdf(
        {
          id: 'cn-3',
          noteNumber: 'NC-3',
          issuedAt: new Date('2025-03-15'),
          reason: 'test',
          currencyCode: 'ARS',
          amount: 10,
        } as any,
        {
          invoiceNumber: 'FAC-102',
          dueDate: new Date('2025-03-31'),
          currencyCode: 'ARS',
          total: 10,
        } as any,
        i18n,
        'es',
      ),
    ).rejects.toThrow('i18n failure');
  });
});
