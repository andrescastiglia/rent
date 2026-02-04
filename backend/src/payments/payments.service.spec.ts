import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentsService } from './payments.service';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { PaymentItem, PaymentItemType } from './entities/payment-item.entity';
import { Receipt } from './entities/receipt.entity';
import { Invoice } from './entities/invoice.entity';
import { TenantAccountsService } from './tenant-accounts.service';
import { ReceiptPdfService } from './receipt-pdf.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentsRepository: MockRepository<Payment>;
  let paymentItemsRepository: MockRepository<PaymentItem>;
  let receiptsRepository: MockRepository<Receipt>;
  let invoicesRepository: MockRepository<Invoice>;
  let tenantAccountsService: Partial<TenantAccountsService>;

  type MockRepository<T extends Record<string, any> = any> = Partial<
    Record<keyof Repository<T>, jest.Mock>
  >;

  const createMockRepository = (): MockRepository => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(async () => {
    tenantAccountsService = {
      findOne: jest.fn(),
      addMovement: jest.fn(),
      findByLease: jest.fn(),
      calculateLateFee: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getRepositoryToken(Payment), useValue: createMockRepository() },
        { provide: getRepositoryToken(PaymentItem), useValue: createMockRepository() },
        { provide: getRepositoryToken(Receipt), useValue: createMockRepository() },
        { provide: getRepositoryToken(Invoice), useValue: createMockRepository() },
        { provide: TenantAccountsService, useValue: tenantAccountsService },
        { provide: ReceiptPdfService, useValue: { generate: jest.fn() } },
      ],
    }).compile();

    service = module.get(PaymentsService);
    paymentsRepository = module.get(getRepositoryToken(Payment));
    paymentItemsRepository = module.get(getRepositoryToken(PaymentItem));
    receiptsRepository = module.get(getRepositoryToken(Receipt));
    invoicesRepository = module.get(getRepositoryToken(Invoice));
  });

  it('should compute payment amount from variable items', async () => {
    const dto = {
      tenantAccountId: 'acc-1',
      amount: 80,
      currencyCode: 'ARS',
      paymentDate: '2025-01-10',
      method: 'cash',
      items: [
        { description: 'Alquiler', amount: 100, quantity: 1, type: PaymentItemType.CHARGE },
        { description: 'Descuento', amount: 20, quantity: 1, type: PaymentItemType.DISCOUNT },
      ],
    };

    (tenantAccountsService.findOne as jest.Mock).mockResolvedValue({
      id: 'acc-1',
      companyId: 'company-1',
      tenantId: 'tenant-1',
    });

    paymentsRepository.create!.mockImplementation((data) => ({ id: 'pay-1', ...data }));
    paymentsRepository.save!.mockResolvedValue({ id: 'pay-1' });
    paymentItemsRepository.create!.mockImplementation((data) => ({ ...data }));
    paymentItemsRepository.save!.mockResolvedValue([]);

    await service.create(dto as any);

    expect(paymentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 80,
        tenantAccountId: 'acc-1',
      }),
    );
    expect(paymentItemsRepository.save).toHaveBeenCalled();
  });

  it('should allow editing pending payments with new items', async () => {
    const payment = {
      id: 'pay-1',
      status: PaymentStatus.PENDING,
      amount: 100,
    } as Payment;

    jest.spyOn(service, 'findOne').mockResolvedValue(payment);
    paymentItemsRepository.delete!.mockResolvedValue({ affected: 1 });
    paymentItemsRepository.create!.mockImplementation((data) => ({ ...data }));
    paymentItemsRepository.save!.mockResolvedValue([]);
    paymentsRepository.save!.mockResolvedValue(payment);
    paymentsRepository.findOne!.mockResolvedValue(payment);

    const result = await service.update('pay-1', {
      items: [
        { description: 'Alquiler', amount: 200, quantity: 1, type: PaymentItemType.CHARGE },
      ],
    } as any);

    expect(paymentItemsRepository.delete).toHaveBeenCalledWith({ paymentId: 'pay-1' });
    expect(result.amount).toBe(200);
  });

  it('should list receipts by tenant', async () => {
    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    receiptsRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);

    await service.findReceiptsByTenant('tenant-1');

    expect(mockQueryBuilder.where).toHaveBeenCalledWith(
      'payment.tenant_id = :tenantId',
      { tenantId: 'tenant-1' },
    );
    expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
      'receipt.issue_date',
      'DESC',
    );
  });
});
