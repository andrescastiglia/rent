import { NotFoundException } from '@nestjs/common';
import { TenantAccountsService } from './tenant-accounts.service';
import { MovementType } from './entities/tenant-account-movement.entity';
import { LateFeeType } from '../leases/entities/lease.entity';
import { InvoiceStatus } from './entities/invoice.entity';

describe('TenantAccountsService', () => {
  const accountsRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
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

  let service: TenantAccountsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TenantAccountsService(
      accountsRepository as any,
      movementsRepository as any,
      leasesRepository as any,
    );
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
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('findByLease returns existing account or creates one', async () => {
    accountsRepository.findOne.mockResolvedValueOnce({ id: 'acc-1' });
    await expect(service.findByLease('l1')).resolves.toEqual({ id: 'acc-1' });

    accountsRepository.findOne.mockResolvedValueOnce(null);
    const createSpy = jest
      .spyOn(service, 'createForLease')
      .mockResolvedValue({ id: 'acc-2' } as any);
    await expect(service.findByLease('l2')).resolves.toEqual({ id: 'acc-2' });
    expect(createSpy).toHaveBeenCalledWith('l2');
  });

  it('adds account movement and updates balance', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
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
    );

    expect(accountsRepository.update).toHaveBeenCalledWith(
      'acc-1',
      expect.objectContaining({ balance: 50 }),
    );
    expect(result.balanceAfter).toBe(50);
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
