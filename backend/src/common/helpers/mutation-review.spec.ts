import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  assertApprovedMutationReview,
  buildMutationReview,
  withApprovedMutationReview,
} from './mutation-review';
import { withDomainOperationReceipt } from './domain-operation-receipt';

describe('Mutation review and transactional recovery', () => {
  const companyId = 'company';
  const executionKey = '22222222-2222-4222-8222-222222222222';
  const payload = { id: 'invoice', amount: '10.00', currencyCode: 'ARS' };
  const expiresAt = '2099-10-01T23:00:00Z';
  const state = {
    id: 'invoice',
    status: 'pending',
    version: 'v1',
    currency: 'ARS',
  };
  const manager = {
    query: jest.fn(),
    queryRunner: { isTransactionActive: true },
  };
  beforeEach(() => manager.query.mockReset());

  it('shows only company-scoped state and the proposed change', async () => {
    manager.query.mockResolvedValue([{ state }]);
    const review = await buildMutationReview(
      manager as any,
      companyId,
      'patch_invoice_by_id',
      payload,
      expiresAt,
    );
    expect(manager.query.mock.calls[0][1]).toEqual(['invoice', companyId]);
    expect(review).toMatchObject({
      currentState: state,
      proposedChange: payload,
      amount: '10.00',
      currency: 'ARS',
      expiresAt,
    });
    expect(review.observedVersion).toMatch(/^[a-f\d]{64}$/);
  });

  it('rejects a missing company or a resource from another company', async () => {
    await expect(
      buildMutationReview(
        manager as any,
        '',
        'patch_invoice_by_id',
        payload,
        expiresAt,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    manager.query.mockResolvedValue([]);
    await expect(
      buildMutationReview(
        manager as any,
        companyId,
        'patch_invoice_by_id',
        payload,
        expiresAt,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('locks and rejects a changed record before domain writes', async () => {
    manager.query.mockResolvedValueOnce([{ state }]);
    const review = await buildMutationReview(
      manager as any,
      companyId,
      'patch_invoice_by_id',
      payload,
      expiresAt,
    );
    manager.query.mockResolvedValue([
      { state: { ...state, status: 'paid', version: 'v2' } },
    ]);
    await expect(
      withApprovedMutationReview(
        {
          companyId,
          executionKey,
          tool: 'patch_invoice_by_id',
          payload,
          review,
        },
        () =>
          assertApprovedMutationReview(manager as any, companyId, executionKey),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(manager.query.mock.calls[1][0]).toContain('FOR UPDATE');
  });

  it('recovers the committed result before comparing the changed state', async () => {
    manager.query.mockResolvedValueOnce([{ state }]);
    const review = await buildMutationReview(
      manager as any,
      companyId,
      'patch_invoice_by_id',
      payload,
      '2000-01-01T00:00:00Z',
    );
    manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { matches: true, result: { receiptId: 'original' } },
      ]);
    const execute = jest.fn();
    await expect(
      withApprovedMutationReview(
        {
          companyId,
          executionKey,
          tool: 'patch_invoice_by_id',
          payload,
          review,
        },
        () =>
          withDomainOperationReceipt(
            manager as any,
            companyId,
            executionKey,
            'invoice.update',
            payload,
            execute,
          ),
      ),
    ).resolves.toEqual({ receiptId: 'original' });
    expect(execute).not.toHaveBeenCalled();
    expect(manager.query).toHaveBeenCalledTimes(3);
  });

  it.each(['2000-01-01T00:00:00Z', 'invalid'])(
    'does not execute an uncommitted operation with expired or invalid review %s',
    async (expiration) => {
      manager.query.mockResolvedValueOnce([{ state }]);
      const review = await buildMutationReview(
        manager as never,
        companyId,
        'patch_invoice_by_id',
        payload,
        expiration,
      );
      manager.query.mockResolvedValue([]);
      const execute = jest.fn();
      await expect(
        withApprovedMutationReview(
          {
            companyId,
            executionKey,
            tool: 'patch_invoice_by_id',
            payload,
            review,
          },
          () =>
            withDomainOperationReceipt(
              manager as never,
              companyId,
              executionKey,
              'invoice.update',
              payload,
              execute,
            ),
        ),
      ).rejects.toThrow('revisión venció');
      expect(execute).not.toHaveBeenCalled();
      expect(
        manager.query.mock.calls.some(([sql]) =>
          sql.includes('INSERT INTO domain_operation_receipts'),
        ),
      ).toBe(false);
    },
  );
});
