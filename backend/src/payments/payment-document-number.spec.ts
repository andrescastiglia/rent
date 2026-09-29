import { allocatePaymentDocumentNumber } from './payment-document-number';

describe('allocatePaymentDocumentNumber', () => {
  it('requires the document transaction before allocating a number', async () => {
    const query = jest.fn();
    await expect(
      allocatePaymentDocumentNumber(undefined, 'receipt'),
    ).rejects.toThrow('active transaction');
    await expect(
      allocatePaymentDocumentNumber(
        { query, queryRunner: { isTransactionActive: false } } as never,
        'credit_note',
      ),
    ).rejects.toThrow('active transaction');
    expect(query).not.toHaveBeenCalled();
  });

  it('preserves the exact database string and passes only a supported kind', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ number: 'REC-202609-9007199254740994' }]);
    await expect(
      allocatePaymentDocumentNumber(
        { query, queryRunner: { isTransactionActive: true } } as never,
        'receipt',
      ),
    ).resolves.toBe('REC-202609-9007199254740994');
    expect(query).toHaveBeenCalledWith(
      'SELECT next_payment_document_number($1) AS number',
      ['receipt'],
    );
  });

  it('rejects a missing allocator result instead of persisting an empty number', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await expect(
      allocatePaymentDocumentNumber(
        { query, queryRunner: { isTransactionActive: true } } as never,
        'credit_note',
      ),
    ).rejects.toThrow('unavailable');
  });
});
