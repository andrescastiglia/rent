import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  amendmentDay,
  amendmentValues,
  applyDueAmendments,
  assertNoPendingBillingAmendment,
} from './amendment-application';
import { ContractType, Lease, LeaseStatus } from './entities/lease.entity';
import {
  AmendmentChangeType,
  LeaseAmendment,
} from './entities/lease-amendment.entity';
import {
  Property,
  PropertyOperationState,
} from '../properties/entities/property.entity';

describe('amendment value allowlist', () => {
  it('normalizes a Date without accepting timestamps or invalid calendar days', () => {
    expect(amendmentDay(new Date('2026-10-02T12:30:00Z'))).toBe('2026-10-02');
    expect(amendmentDay('2026-10-02')).toBe('2026-10-02');
    expect(() => amendmentDay('2026-02-30')).toThrow(BadRequestException);
    expect(() => amendmentDay('2026-10-02T12:30:00Z')).toThrow(
      BadRequestException,
    );
  });

  it.each([
    AmendmentChangeType.RENT_INCREASE,
    AmendmentChangeType.RENT_DECREASE,
  ])(
    'accepts only a positive exact rent for %s and normalizes its legacy alias',
    (type) => {
      expect(amendmentValues(type, { monthlyRent: '123.45' })).toEqual({
        monthlyRent: 123.45,
      });
      expect(amendmentValues(type, { rentAmount: 50 })).toEqual({
        monthlyRent: 50,
      });
      for (const monthlyRent of ['0', '-1', '1.001', '1e5', '10000000000'])
        expect(() => amendmentValues(type, { monthlyRent })).toThrow(
          BadRequestException,
        );
      expect(() =>
        amendmentValues(type, { monthlyRent: 10, companyId: 'foreign' }),
      ).toThrow(BadRequestException);
    },
  );

  it.each([
    [AmendmentChangeType.EXTENSION, { endDate: '2027-01-31' }],
    [AmendmentChangeType.EARLY_TERMINATION, {}],
    [AmendmentChangeType.CLAUSE_MODIFICATION, { termsAndConditions: 'Terms' }],
    [AmendmentChangeType.CLAUSE_MODIFICATION, { specialClauses: 'Clause' }],
    [AmendmentChangeType.GUARANTOR_CHANGE, { specialClauses: 'Guarantor' }],
    [AmendmentChangeType.OTHER, { specialClauses: 'Other' }],
  ])('accepts the complete allowed payload for %s', (type, values) => {
    expect(amendmentValues(type as AmendmentChangeType, values)).toEqual(
      values,
    );
  });

  it.each([
    [AmendmentChangeType.EXTENSION, { endDate: '2027-02-30' }],
    [AmendmentChangeType.EARLY_TERMINATION, { status: 'active' }],
    [AmendmentChangeType.CLAUSE_MODIFICATION, {}],
    [AmendmentChangeType.CLAUSE_MODIFICATION, { specialClauses: ' ' }],
    [AmendmentChangeType.GUARANTOR_CHANGE, { guarantorId: 'new-person' }],
    [AmendmentChangeType.OTHER, { monthlyRent: 123 }],
  ])('rejects incomplete or unknown fields for %s', (type, values) => {
    expect(() => amendmentValues(type as AmendmentChangeType, values)).toThrow(
      BadRequestException,
    );
  });

  it('rejects unknown kinds and missing required values', () => {
    expect(() => amendmentValues('unsupported' as AmendmentChangeType)).toThrow(
      BadRequestException,
    );
    expect(() => amendmentValues(AmendmentChangeType.RENT_INCREASE)).toThrow(
      BadRequestException,
    );
  });
});

describe('due amendment application', () => {
  const companyId = 'company-1';
  const leaseId = 'lease-1';
  const setup = () => {
    const lease: Partial<Lease> = {
      id: leaseId,
      companyId,
      propertyId: 'property-1',
      contractType: ContractType.RENTAL,
      status: LeaseStatus.ACTIVE,
      startDate: new Date('2026-01-01T12:00:00Z'),
      endDate: new Date('2026-12-31T12:00:00Z'),
      monthlyRent: 100,
      termsAndConditions: 'Original terms',
      lastAdjustmentDate: null as never,
      nextAdjustmentDate: null as never,
    };
    const amendment: Partial<LeaseAmendment> = {
      id: 'amendment-1',
      companyId,
      leaseId,
      changeType: AmendmentChangeType.RENT_INCREASE,
      effectiveDate: new Date('2026-10-01T12:00:00Z'),
      amendmentNumber: 1,
      createdAt: new Date('2026-09-01T12:00:00Z'),
      newValues: { monthlyRent: 120 },
    };
    const rows = [{ id: amendment.id }];
    const leaseRepo = {
      findOneByOrFail: jest.fn().mockResolvedValue(lease),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const amendmentRepo = {
      findOneByOrFail: jest.fn().mockResolvedValue(amendment),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const propertyRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const manager: any = {
      query: jest.fn(async (sql: string, _params?: unknown[]) =>
        sql.includes('FOR NO KEY UPDATE') ? rows : [],
      ),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Lease) return leaseRepo;
        if (entity === LeaseAmendment) return amendmentRepo;
        if (entity === Property) return propertyRepo;
        throw new Error('Unexpected repository');
      }),
      transaction: jest.fn(async (work: (m: EntityManager) => unknown) =>
        work(manager),
      ),
    };
    return {
      lease,
      amendment,
      rows,
      manager,
      leaseRepo,
      amendmentRepo,
      propertyRepo,
      run: () => applyDueAmendments(manager, leaseId, companyId),
    };
  };

  it('applies a rent increase in the nested transaction with immutable before/after data', async () => {
    const f = setup();
    await expect(f.run()).resolves.toEqual({ applied: 1, failed: 0 });
    expect(f.leaseRepo.findOneByOrFail).toHaveBeenCalledWith({
      id: leaseId,
      companyId,
    });
    expect(f.amendmentRepo.findOneByOrFail).toHaveBeenCalledWith({
      id: 'amendment-1',
      companyId,
    });
    expect(f.leaseRepo.update).toHaveBeenCalledWith(
      { id: leaseId, companyId },
      {
        monthlyRent: 120,
        lastAdjustmentDate: new Date('2026-10-01T12:00:00Z'),
      },
    );
    expect(f.amendmentRepo.update).toHaveBeenCalledWith(
      { id: 'amendment-1', companyId },
      expect.objectContaining({
        applicationStatus: 'applied',
        applicationError: null,
        applicationSnapshot: {
          before: { monthlyRent: 100, lastAdjustmentDate: null },
          after: {
            monthlyRent: 120,
            lastAdjustmentDate: new Date('2026-10-01T12:00:00Z'),
          },
        },
      }),
    );
    expect(f.propertyRepo.update).not.toHaveBeenCalled();
  });

  it('applies a rent decrease without changing its adjustment calendar', async () => {
    const f = setup();
    f.amendment.changeType = AmendmentChangeType.RENT_DECREASE;
    f.amendment.newValues = { rentAmount: 90 };
    f.lease.lastAdjustmentDate = new Date('2026-09-01T12:00:00Z');
    f.lease.nextAdjustmentDate = new Date('2026-11-01T12:00:00Z');
    await expect(f.run()).resolves.toEqual({ applied: 1, failed: 0 });
    expect(f.leaseRepo.update).toHaveBeenCalledWith(
      { id: leaseId, companyId },
      expect.objectContaining({ monthlyRent: 90 }),
    );
  });

  it('extends a contract beyond its old end and skips irrelevant invoice checks', async () => {
    const f = setup();
    f.amendment.changeType = AmendmentChangeType.EXTENSION;
    f.amendment.effectiveDate = new Date('2027-01-01T12:00:00Z');
    f.amendment.newValues = { endDate: '2027-12-31' };
    await expect(f.run()).resolves.toEqual({ applied: 1, failed: 0 });
    expect(f.leaseRepo.update).toHaveBeenCalledWith(
      { id: leaseId, companyId },
      { endDate: new Date('2027-12-31T12:00:00Z') },
    );
    expect(
      f.manager.query.mock.calls.some(([sql]: [string]) =>
        sql.includes('FROM invoices'),
      ),
    ).toBe(false);
  });

  it.each([
    [ContractType.RENTAL, 'property-1', true],
    [ContractType.RENTAL, null, false],
    [ContractType.SALE, 'property-1', false],
  ])(
    'terminates %s and releases only its rental property',
    async (type, propertyId, releases) => {
      const f = setup();
      f.lease.contractType = type as ContractType;
      f.lease.propertyId = propertyId as string;
      f.amendment.changeType = AmendmentChangeType.EARLY_TERMINATION;
      f.amendment.newValues = {};
      await expect(f.run()).resolves.toEqual({ applied: 1, failed: 0 });
      expect(f.leaseRepo.update).toHaveBeenCalledWith(
        { id: leaseId, companyId },
        {
          status: LeaseStatus.FINALIZED,
          endDate: new Date('2026-10-01T12:00:00Z'),
        },
      );
      if (releases)
        expect(f.propertyRepo.update).toHaveBeenCalledWith(
          { id: 'property-1', companyId },
          { operationState: PropertyOperationState.AVAILABLE },
        );
      else expect(f.propertyRepo.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    { termsAndConditions: 'Replaced terms' },
    { specialClauses: 'Replaced clause' },
    { termsAndConditions: 'Terms', specialClauses: 'Clause' },
  ])('replaces only the reviewed clause fields: %j', async (values) => {
    const f = setup();
    f.amendment.changeType = AmendmentChangeType.CLAUSE_MODIFICATION;
    f.amendment.newValues = values;
    await expect(f.run()).resolves.toEqual({ applied: 1, failed: 0 });
    expect(f.leaseRepo.update).toHaveBeenCalledWith(
      { id: leaseId, companyId },
      values,
    );
  });

  it.each([
    'inactive',
    'no-start',
    'before-start',
    'after-end',
    'later-applied',
    'non-rental-rent',
    'invalid-current-rent',
    'increase-reverses',
    'decrease-reverses',
    'past-adjustment',
    'next-adjustment',
    'billed-period',
    'no-extension-end',
    'extension-not-advanced',
    'extension-before-effective',
    'invalid-values',
  ])(
    'records %s as a reviewable conflict without modifying the contract',
    async (state) => {
      const f = setup();
      if (state === 'inactive') f.lease.status = LeaseStatus.DRAFT;
      if (state === 'no-start') f.lease.startDate = undefined;
      if (state === 'before-start')
        f.amendment.effectiveDate = new Date('2025-12-31T12:00:00Z');
      if (state === 'after-end')
        f.amendment.effectiveDate = new Date('2027-01-01T12:00:00Z');
      if (state === 'non-rental-rent') f.lease.contractType = ContractType.SALE;
      if (state === 'invalid-current-rent') f.lease.monthlyRent = NaN;
      if (state === 'increase-reverses')
        f.amendment.newValues = { monthlyRent: 90 };
      if (state === 'decrease-reverses')
        f.amendment.changeType = AmendmentChangeType.RENT_DECREASE;
      if (state === 'past-adjustment')
        f.lease.lastAdjustmentDate = new Date('2026-10-02T12:00:00Z');
      if (state === 'next-adjustment')
        f.lease.nextAdjustmentDate = new Date('2026-10-01T12:00:00Z');
      if (state.startsWith('extension') || state === 'no-extension-end') {
        f.amendment.changeType = AmendmentChangeType.EXTENSION;
        f.amendment.newValues = { endDate: '2026-12-31' };
        if (state === 'no-extension-end') f.lease.endDate = undefined as never;
        if (state === 'extension-before-effective') {
          f.amendment.effectiveDate = new Date('2027-02-01T12:00:00Z');
          f.amendment.newValues = { endDate: '2027-01-31' };
        }
      }
      if (state === 'invalid-values') f.amendment.newValues = { role: 'admin' };
      if (state === 'later-applied' || state === 'billed-period')
        f.manager.query.mockImplementation(async (sql: string) => {
          if (sql.includes('FOR NO KEY UPDATE')) return f.rows;
          if (
            state === 'later-applied' &&
            sql.includes("application_status='applied'")
          )
            return [{ id: 'later-1' }];
          if (state === 'billed-period' && sql.includes('FROM invoices'))
            return [{ id: 'invoice-1' }];
          return [];
        });
      await expect(f.run()).resolves.toEqual({ applied: 0, failed: 1 });
      expect(f.leaseRepo.update).not.toHaveBeenCalled();
      expect(f.propertyRepo.update).not.toHaveBeenCalled();
      expect(f.amendmentRepo.update).toHaveBeenCalledWith(
        { id: 'amendment-1', companyId },
        expect.objectContaining({
          applicationStatus: 'error',
          applicationError: expect.any(String),
          lastApplicationAttemptAt: expect.any(Date),
        }),
      );
    },
  );

  it('keeps no-end leases valid for rent changes', async () => {
    const f = setup();
    f.lease.endDate = null as never;
    await expect(f.run()).resolves.toEqual({ applied: 1, failed: 0 });
  });

  it('stops at the first failed amendment, keeping earlier applications and hiding SQL details', async () => {
    const f = setup();
    f.rows.push({ id: 'amendment-2' }, { id: 'amendment-3' });
    f.amendmentRepo.findOneByOrFail.mockRejectedValueOnce(
      new Error('private SQL connection details'),
    );
    await expect(f.run()).resolves.toEqual({ applied: 0, failed: 1 });
    expect(f.amendmentRepo.findOneByOrFail).toHaveBeenCalledTimes(1);
    expect(f.amendmentRepo.update).toHaveBeenCalledWith(
      { id: 'amendment-1', companyId },
      expect.objectContaining({
        applicationError:
          'Amendment application failed; retry or review required',
      }),
    );
  });

  it('does not open a nested transaction when no due amendments remain', async () => {
    const f = setup();
    f.rows.splice(0);
    await expect(f.run()).resolves.toEqual({ applied: 0, failed: 0 });
    expect(f.manager.transaction).not.toHaveBeenCalled();
  });

  it.each(['pending', 'terminated', 'none'])(
    'gates billing against %s amendments',
    async (state) => {
      const manager = {
        query: jest.fn(async (sql: string) => {
          if (state === 'pending' && sql.includes("'legacy_review'"))
            return [{ id: 'pending-1' }];
          if (
            state === 'terminated' &&
            sql.includes("application_status='applied'")
          )
            return [{ id: 'termination-1' }];
          return [];
        }),
      };
      const promise = assertNoPendingBillingAmendment(
        manager as never,
        leaseId,
        companyId,
        '2026-10-31',
      );
      if (state === 'none') await expect(promise).resolves.toBeUndefined();
      else await expect(promise).rejects.toBeInstanceOf(ConflictException);
      expect(manager.query.mock.calls[0][0]).toContain('company_id=$2');
    },
  );
});
