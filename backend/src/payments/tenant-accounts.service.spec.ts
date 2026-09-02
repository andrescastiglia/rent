import { NotFoundException } from '@nestjs/common';
import { TenantAccountsService } from './tenant-accounts.service';
import {
  MovementType,
  TenantAccountMovement,
} from './entities/tenant-account-movement.entity';
import { LateFeeType } from '../leases/entities/lease.entity';
import { InvoiceStatus } from './entities/invoice.entity';

describe('TenantAccountsService', () => {
  const accountsRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const movementsRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };
  const leasesRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: (manager: any) => unknown) =>
      callback({
        getRepository: (entity: unknown) =>
          entity === TenantAccountMovement
            ? movementsRepository
            : accountsRepository,
      }),
    ),
  };

  let service: TenantAccountsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TenantAccountsService(
      accountsRepository as any,
      movementsRepository as any,
      leasesRepository as any,
      dataSource as any,
    );
  });

  it('scopes account reads by company and tenant identity', async () => {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 'acc-1', balance: 0 }),
    };
    accountsRepository.createQueryBuilder.mockReturnValue(query);

    await expect(
      service.findOneScoped('acc-1', {
        id: 'tenant-user-1',
        companyId: 'company-a',
        role: 'tenant',
      } as any),
    ).resolves.toEqual(expect.objectContaining({ id: 'acc-1' }));

    expect(query.where).toHaveBeenCalledWith(
      'account.company_id = :companyId',
      { companyId: 'company-a' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'tenant.user_id = :scopeUserId',
      { scopeUserId: 'tenant-user-1' },
    );
  });

  it('does not expose an account from another company', async () => {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    accountsRepository.createQueryBuilder.mockReturnValue(query);

    await expect(
      service.findOneScoped('foreign-account', {
        id: 'admin-1',
        companyId: 'company-a',
        role: 'admin',
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createForLease handles missing lease/existing account/missing tenant/success', async () => {
    leasesRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.createForLease('l1')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    leasesRepository.findOne.mockResolvedValueOnce({ id: 'l1' });
    accountsRepository.findOne.mockResolvedValueOnce({ id: 'acc-existing' });
    await expect(service.createForLease('l1')).resolves.toEqual({
      id: 'acc-existing',
    });

    leasesRepository.findOne.mockResolvedValueOnce({
      id: 'l2',
      tenantId: null,
    });
    accountsRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.createForLease('l2')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    leasesRepository.findOne.mockResolvedValueOnce({
      id: 'l3',
      companyId: 'co1',
      tenantId: 't1',
      currency: 'ARS',
    });
    accountsRepository.findOne.mockResolvedValueOnce(null);
    accountsRepository.create.mockImplementation((x) => x);
    accountsRepository.save.mockImplementation(async (x) => ({
      id: 'acc-1',
      ...x,
    }));
    await expect(service.createForLease('l3')).resolves.toEqual(
      expect.objectContaining({ id: 'acc-1', leaseId: 'l3' }),
    );
  });

  it('findOne throws when account is missing', async () => {
    accountsRepository.findOne.mockResolvedValue(null);
    await expect(
      service.findOne('missing', 'company-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(accountsRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'missing', companyId: 'company-a' },
      }),
    );
  });

  it('findByLease returns an existing account and never creates on GET', async () => {
    accountsRepository.findOne.mockResolvedValueOnce({ id: 'acc-1' });
    await expect(service.findByLease('l1')).resolves.toEqual({ id: 'acc-1' });

    accountsRepository.findOne.mockResolvedValueOnce(null);
    const createSpy = jest.spyOn(service, 'createForLease');
    await expect(service.findByLease('l2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('adds account movement and updates balance', async () => {
    accountsRepository.findOne.mockResolvedValue({
      id: 'acc-1',
      balance: 100,
    } as any);
    movementsRepository.create.mockImplementation((x) => x);
    movementsRepository.save.mockImplementation(async (x) => x);

    const result = await service.addMovement(
      'acc-1',
      MovementType.PAYMENT,
      -50,
      'payment',
      'pay-1',
      'desc',
      'co1',
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(accountsRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'acc-1', companyId: 'co1' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(accountsRepository.update).toHaveBeenCalledWith(
      { id: 'acc-1', companyId: 'co1' },
      expect.objectContaining({ balance: 50 }),
    );
    expect(result.balanceAfter).toBe(50);
  });

  it('joins an existing transaction without opening a nested one', async () => {
    accountsRepository.findOne.mockResolvedValue({
      id: 'acc-1',
      balance: 25,
    } as any);
    movementsRepository.create.mockImplementation((x) => x);
    movementsRepository.save.mockImplementation(async (x) => x);
    const manager = {
      getRepository: (entity: unknown) =>
        entity === TenantAccountMovement
          ? movementsRepository
          : accountsRepository,
    } as any;

    const result = await service.addMovementWithManager(manager, {
      accountId: 'acc-1',
      type: MovementType.CHARGE,
      amount: 75,
      referenceType: 'invoice',
      referenceId: 'inv-1',
      description: 'Factura INV-1',
      companyId: 'co1',
    });

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(result.balanceAfter).toBe(100);
  });

  it('calculates late fee across configured modes', async () => {
    accountsRepository.findOne.mockResolvedValueOnce({
      lease: { lateFeeType: null, lateFeeValue: 1 },
      invoices: [],
    });
    await expect(service.calculateLateFee('acc-1')).resolves.toBe(0);

    const dueDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    accountsRepository.findOne.mockResolvedValueOnce({
      lease: { lateFeeType: LateFeeType.DAILY_PERCENTAGE, lateFeeValue: 1 },
      invoices: [
        {
          status: InvoiceStatus.PENDING,
          dueDate,
          total: 1000,
          amountPaid: 0,
        },
      ],
    });
    await expect(service.calculateLateFee('acc-1')).resolves.toBe(30);

    accountsRepository.findOne.mockResolvedValueOnce({
      lease: { lateFeeType: LateFeeType.DAILY_FIXED, lateFeeValue: 10 },
      invoices: [
        {
          status: InvoiceStatus.PENDING,
          dueDate,
          total: 1000,
          amountPaid: 0,
        },
      ],
    });
    await expect(service.calculateLateFee('acc-1')).resolves.toBe(30);

    accountsRepository.findOne.mockResolvedValueOnce({
      lease: { lateFeeType: LateFeeType.PERCENTAGE, lateFeeValue: 5 },
      invoices: [
        {
          status: InvoiceStatus.PENDING,
          dueDate,
          total: 1000,
          amountPaid: 0,
        },
      ],
    });
    await expect(service.calculateLateFee('acc-1')).resolves.toBe(50);

    accountsRepository.findOne.mockResolvedValueOnce({
      lease: { lateFeeType: LateFeeType.FIXED, lateFeeValue: 40 },
      invoices: [
        {
          status: InvoiceStatus.PENDING,
          dueDate,
          total: 1000,
          amountPaid: 0,
        },
      ],
    });
    await expect(service.calculateLateFee('acc-1')).resolves.toBe(40);
  });

  it('returns balance info with late fee', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'acc-1',
      balance: 100,
    } as any);
    jest.spyOn(service, 'calculateLateFee').mockResolvedValue(10);

    await expect(service.getBalanceInfo('acc-1')).resolves.toEqual({
      balance: 100,
      lateFee: 10,
      total: 110,
    });
  });
});
