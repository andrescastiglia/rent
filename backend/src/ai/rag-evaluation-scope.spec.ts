/* eslint-disable @typescript-eslint/no-require-imports */
const {
  sourceAuthorized,
  validateEvaluationDataset,
  exactFinancialValueMatches,
  retrievedVectorSources,
} = require('../../scripts/run-rag-eval.js');
const dataset = require('../../evals/rag-eval.dataset.json');

describe('RAG evaluation company and external-role evidence', () => {
  const companyId = '10000000-0000-0000-0000-000000000001';
  const db = { query: jest.fn().mockResolvedValue({ rows: [{ n: 1 }] }) };
  beforeEach(() => jest.clearAllMocks());

  it('measures retrieval from the audited exchange rather than counting only citations', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ retrieved_chunk_ids: ['chunk-1'] }] })
      .mockResolvedValueOnce({
        rows: [
          {
            sourceId: 'chunk-1',
            entityType: 'owner_portfolio_summary',
            entityId: 'owner-1',
          },
        ],
      });
    await expect(
      retrievedVectorSources(
        { query },
        { conversationId: 'conversation-1' },
        { companyId },
        'owner-user',
      ),
    ).resolves.toEqual([
      {
        sourceId: 'chunk-1',
        entityType: 'owner_portfolio_summary',
        entityId: 'owner-1',
      },
    ]);
    expect(query.mock.calls[0][1]).toEqual([
      'conversation-1',
      companyId,
      'owner-user',
    ]);
    expect(query.mock.calls[0][0]).toContain('user_id=$3::uuid');
    expect(query.mock.calls[1][1]).toEqual([['chunk-1']]);
  });

  it.each([
    ['Saldo pendiente: ARS 60.000.000,00.', true],
    ['Saldo pendiente: ARS 6.000.000,00.', false],
    ['El total es ARS 60.000.000 pero el saldo es ARS 900.', false],
  ])(
    'checks canonical sale balances with complete numeric tokens: %s',
    async (outputText, expected) => {
      const query = jest
        .fn()
        .mockResolvedValue({ rows: [{ balance: '60000000.00' }] });
      await expect(
        exactFinancialValueMatches(
          { query },
          { financial: true, prompt: 'Mi saldo pendiente de compraventa' },
          { outputText, insufficientEvidence: false },
          [{ entityType: 'sale_agreement', entityId: 'sale' }],
        ),
      ).resolves.toBe(expected);
      expect(query.mock.calls[0][0]).toContain('total_amount-paid_amount');
    },
  );

  it.each([
    ['Importe: ARS 15000', false],
    ['Importe: ARS 1500.', true],
    ['Importe: ARS 1.500.', true],
    ['Importe: ARS 1.500,00.', true],
    ['Importe: ARS 1500,01.', false],
  ])(
    'checks complete monetary tokens and sentence punctuation: %s',
    async (outputText, expected) => {
      const query = jest.fn().mockResolvedValue({ rows: [{ amount: 1500 }] });
      await expect(
        exactFinancialValueMatches(
          { query },
          { financial: true, prompt: 'Importe del recibo' },
          { outputText, insufficientEvidence: false },
          [{ entityType: 'sale_receipt', entityId: 'receipt' }],
        ),
      ).resolves.toBe(expected);
    },
  );

  it('requires valid versioned cases, including buyer financial and adversarial coverage', () => {
    expect(() => validateEvaluationDataset(dataset)).not.toThrow();
    expect(new Set(dataset.map((test: { role: string }) => test.role))).toEqual(
      new Set(['admin', 'staff', 'owner', 'tenant', 'buyer']),
    );
    const buyers = dataset.filter(
      (test: { role: string }) => test.role === 'buyer',
    );
    expect(
      buyers.some(
        (test: { financial: boolean; shouldAbstain: boolean }) =>
          test.financial && !test.shouldAbstain,
      ),
    ).toBe(true);
    expect(
      buyers.some(
        (test: { category: string; shouldAbstain: boolean }) =>
          test.category === 'adversarial' && test.shouldAbstain,
      ),
    ).toBe(true);
  });

  it.each(['unknown', 'superadmin'])(
    'never substitutes internal permissions for unsupported retrieval role %s',
    async (role) => {
      for (const entityType of [
        'dashboard',
        'structured_query',
        'property',
        'lease',
        'invoice',
        'document_chunk',
        'payment',
      ])
        await expect(
          sourceAuthorized(
            db,
            { entityType, entityId: companyId },
            { role, companyId },
            'buyer-user',
          ),
        ).resolves.toBe(false);
      expect(db.query).not.toHaveBeenCalled();
    },
  );

  it('accepts buyer sales only after checking the canonical contract, company and relationship', async () => {
    for (const entityType of ['sale_agreement', 'sale_receipt', 'lease']) {
      await expect(
        sourceAuthorized(
          db,
          { entityType, entityId: 'sale' },
          { role: 'buyer', companyId },
          'buyer-user',
        ),
      ).resolves.toBe(true);
      expect(db.query).toHaveBeenLastCalledWith(
        expect.stringContaining('b.user_id=$3::uuid'),
        ['sale', companyId, 'buyer-user'],
      );
      db.query.mockResolvedValueOnce({ rows: [{ n: 0 }] });
      await expect(
        sourceAuthorized(
          db,
          { entityType, entityId: 'foreign-sale' },
          { role: 'buyer', companyId },
          'buyer-user',
        ),
      ).resolves.toBe(false);
    }
    db.query.mockClear();
    for (const entityType of [
      'dashboard',
      'property',
      'invoice',
      'payment',
      'document_chunk',
    ]) {
      await expect(
        sourceAuthorized(
          db,
          { entityType, entityId: companyId },
          { role: 'buyer', companyId },
          'buyer-user',
        ),
      ).resolves.toBe(false);
    }
    expect(db.query).not.toHaveBeenCalled();
  });

  it('checks company identity before accepting structured company sources', async () => {
    await expect(
      sourceAuthorized(
        db,
        { entityType: 'dashboard', entityId: 'another-company' },
        { role: 'admin', companyId },
        'admin',
      ),
    ).resolves.toBe(false);
    await expect(
      sourceAuthorized(
        db,
        { entityType: 'structured_query', entityId: companyId },
        { role: 'staff', companyId },
        'staff',
      ),
    ).resolves.toBe(true);
    expect(db.query).not.toHaveBeenCalled();
  });

  it.each(['owner', 'tenant'])(
    'uses an explicit user relationship and company for %s properties',
    async (role) => {
      await expect(
        sourceAuthorized(
          db,
          { entityType: 'property', entityId: 'property' },
          { role, companyId },
          'user',
        ),
      ).resolves.toBe(true);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('user_id=$3::uuid'),
        ['property', companyId, 'user'],
      );
      expect(db.query.mock.calls[0][0]).toContain('p.company_id=$2::uuid');
      db.query.mockResolvedValueOnce({ rows: [{ n: 0 }] });
      await expect(
        sourceAuthorized(
          db,
          { entityType: 'property', entityId: 'foreign' },
          { role, companyId },
          'user',
        ),
      ).resolves.toBe(false);
    },
  );
});
