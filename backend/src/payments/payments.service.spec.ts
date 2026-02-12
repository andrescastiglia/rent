import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentsService } from './payments.service';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { PaymentItem, PaymentItemType } from './entities/payment-item.entity';
import { Receipt } from './entities/receipt.entity';
import { Invoice } from './entities/invoice.entity';
import { CreditNote } from './entities/credit-note.entity';
import { TenantAccountsService } from './tenant-accounts.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { CreditNotePdfService } from './credit-note-pdf.service';
import { UserRole } from '../users/entities/user.entity';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentsRepository: MockRepository<Payment>;
  let paymentItemsRepository: MockRepository<PaymentItem>;
  let receiptsRepository: MockRepository<Receipt>;
  let _invoicesRepository: MockRepository<Invoice>;
  let _creditNotesRepository: MockRepository<CreditNote>;
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
        {
          provide: getRepositoryToken(Payment),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(PaymentItem),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Receipt),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Invoice),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(CreditNote),
          useValue: createMockRepository(),
        },
        { provide: TenantAccountsService, useValue: tenantAccountsService },
        { provide: ReceiptPdfService, useValue: { generate: jest.fn() } },
        { provide: CreditNotePdfService, useValue: { generate: jest.fn() } },
      ],
    }).compile();

    service = module.get(PaymentsService);
    paymentsRepository = module.get(getRepositoryToken(Payment));
    paymentItemsRepository = module.get(getRepositoryToken(PaymentItem));
    receiptsRepository = module.get(getRepositoryToken(Receipt));
    _invoicesRepository = module.get(getRepositoryToken(Invoice));
    _creditNotesRepository = module.get(getRepositoryToken(CreditNote));
  });

  it('should compute payment amount from variable items', async () => {
    const dto = {
      tenantAccountId: 'acc-1',
      amount: 80,
      currencyCode: 'ARS',
      paymentDate: '2025-01-10',
      method: 'cash',
      items: [
        {
          description: 'Alquiler',
          amount: 100,
          quantity: 1,
          type: PaymentItemType.CHARGE,
        },
        {
          description: 'Descuento',
          amount: 20,
          quantity: 1,
          type: PaymentItemType.DISCOUNT,
        },
      ],
    };

    (tenantAccountsService.findOne as jest.Mock).mockResolvedValue({
      id: 'acc-1',
      companyId: 'company-1',
      tenantId: 'tenant-1',
    });

    paymentsRepository.create!.mockImplementation((data) => ({
      id: 'pay-1',
      ...data,
    }));
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
        {
          description: 'Alquiler',
          amount: 200,
          quantity: 1,
          type: PaymentItemType.CHARGE,
        },
      ],
    } as any);

    expect(paymentItemsRepository.delete).toHaveBeenCalledWith({
      paymentId: 'pay-1',
    });
    expect(result.amount).toBe(200);
  });

  it('should list receipts by tenant', async () => {
    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    receiptsRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);

    await service.findReceiptsByTenant('tenant-1', {
      id: 'admin-1',
      role: UserRole.ADMIN,
    });

    expect(mockQueryBuilder.where).toHaveBeenCalledWith(
      '(payment.tenant_id = :tenantId OR tenant.user_id = :tenantId)',
      { tenantId: 'tenant-1' },
    );
    expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
      'receipt.issue_date',
      'DESC',
    );
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'payment.deleted_at IS NULL',
    );
  });

  it('should confirm payment using tenant account from invoice when payment lacks tenantAccountId', async () => {
    const payment = {
      id: 'pay-1',
      status: PaymentStatus.PENDING,
      amount: 100,
      method: 'cash',
      invoiceId: 'inv-1',
      tenantAccountId: null,
      companyId: 'company-1',
      currencyCode: 'ARS',
    } as unknown as Payment;

    const confirmedPayment = {
      ...payment,
      status: PaymentStatus.COMPLETED,
      tenantAccountId: 'acc-from-invoice',
    } as unknown as Payment;

    jest
      .spyOn(service, 'findOne')
      .mockResolvedValueOnce(payment)
      .mockResolvedValueOnce(confirmedPayment);

    _invoicesRepository.findOne!.mockResolvedValue({
      id: 'inv-1',
      tenantAccountId: 'acc-from-invoice',
    });

    (tenantAccountsService.addMovement as jest.Mock).mockResolvedValue({
      id: 'mov-1',
    });

    jest
      .spyOn(service as any, 'applyPaymentToInvoices')
      .mockResolvedValueOnce([]);
    jest
      .spyOn(service as any, 'createCreditNotesForSettledLateFees')
      .mockResolvedValueOnce(undefined);
    jest
      .spyOn(service as any, 'generateReceipt')
      .mockResolvedValueOnce({ id: 'rec-1' } as Receipt);

    paymentsRepository.save!.mockResolvedValue(confirmedPayment);

    const result = await service.confirm('pay-1');

    expect(tenantAccountsService.addMovement).toHaveBeenCalledWith(
      'acc-from-invoice',
      expect.anything(),
      -100,
      'payment',
      'pay-1',
      expect.stringContaining('Pago recibido'),
    );
    expect(paymentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pay-1',
        status: PaymentStatus.COMPLETED,
        tenantAccountId: 'acc-from-invoice',
      }),
    );
    expect(result).toEqual(confirmedPayment);
  });

  it('should throw bad request when confirming payment without tenant account', async () => {
    const payment = {
      id: 'pay-1',
      status: PaymentStatus.PENDING,
      amount: 100,
      method: 'cash',
      invoiceId: null,
      tenantAccountId: null,
    } as unknown as Payment;

    jest.spyOn(service, 'findOne').mockResolvedValue(payment);

    await expect(service.confirm('pay-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(paymentsRepository.save).not.toHaveBeenCalled();
    expect(tenantAccountsService.addMovement).not.toHaveBeenCalled();
  });
});
