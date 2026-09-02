import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentsService } from './payments.service';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { PaymentItem, PaymentItemType } from './entities/payment-item.entity';
import { PaymentAllocation } from './entities/payment-allocation.entity';
import { Receipt } from './entities/receipt.entity';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { CreditNote, CreditNoteStatus } from './entities/credit-note.entity';
import { TenantAccountsService } from './tenant-accounts.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { CreditNotePdfService } from './credit-note-pdf.service';
import { UserRole } from '../users/entities/user.entity';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CommunicationsService } from '../communications/communications.service';
import { MovementType } from './entities/tenant-account-movement.entity';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentsRepository: MockRepository<Payment>;
  let paymentItemsRepository: MockRepository<PaymentItem>;
  let receiptsRepository: MockRepository<Receipt>;
  let _invoicesRepository: MockRepository<Invoice>;
  let _creditNotesRepository: MockRepository<CreditNote>;
  let paymentAllocationsRepository: MockRepository<PaymentAllocation>;
  let tenantAccountsService: Partial<TenantAccountsService>;
  let dataSource: { transaction: jest.Mock };

  type MockRepository<T extends Record<string, any> = any> = Partial<
    Record<keyof Repository<T>, jest.Mock>
  >;

  const createMockRepository = (): MockRepository => ({
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(async () => {
    tenantAccountsService = {
      findOne: jest.fn(),
      addMovement: jest.fn(),
      addMovementWithManager: jest.fn(),
      findByLease: jest.fn(),
      calculateLateFee: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn(async (callback: (manager: any) => unknown) =>
        callback({
          getRepository: (entity: unknown) => {
            if (entity === Payment) return paymentsRepository;
            if (entity === Invoice) return _invoicesRepository;
            if (entity === Receipt) return receiptsRepository;
            if (entity === CreditNote) return _creditNotesRepository;
            if (entity === PaymentAllocation)
              return paymentAllocationsRepository;
            throw new Error('Unexpected transaction repository');
          },
        }),
      ),
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
        {
          provide: getRepositoryToken(PaymentAllocation),
          useValue: createMockRepository(),
        },
        { provide: TenantAccountsService, useValue: tenantAccountsService },
        { provide: ReceiptPdfService, useValue: { generate: jest.fn() } },
        { provide: CreditNotePdfService, useValue: { generate: jest.fn() } },
        {
          provide: WhatsappService,
          useValue: {
            sendTextMessage: jest.fn(),
            sendTemplateMessage: jest.fn(),
          },
        },
        {
          provide: CommunicationsService,
          useValue: { dispatchEvent: jest.fn() },
        },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(PaymentsService);
    paymentsRepository = module.get(getRepositoryToken(Payment));
    paymentItemsRepository = module.get(getRepositoryToken(PaymentItem));
    receiptsRepository = module.get(getRepositoryToken(Receipt));
    _invoicesRepository = module.get(getRepositoryToken(Invoice));
    _creditNotesRepository = module.get(getRepositoryToken(CreditNote));
    paymentAllocationsRepository = module.get(
      getRepositoryToken(PaymentAllocation),
    );
    paymentAllocationsRepository.find!.mockResolvedValue([]);
    _creditNotesRepository.find!.mockResolvedValue([]);
    receiptsRepository.findOne!.mockResolvedValue(null);
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

    await service.create(dto as any, undefined, 'company-1');

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

    const result = await service.update(
      'pay-1',
      {
        items: [
          {
            description: 'Alquiler',
            amount: 200,
            quantity: 1,
            type: PaymentItemType.CHARGE,
          },
        ],
      } as any,
      'company-1',
    );

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
      companyId: 'company-1',
      role: UserRole.ADMIN,
    });

    expect(mockQueryBuilder.where).toHaveBeenCalledWith(
      '(payment.tenant_id = :tenantId OR tenant.user_id = :tenantId)',
      { tenantId: 'tenant-1' },
    );
    expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
      'receipt.issuedAt',
      'DESC',
    );
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'payment.deleted_at IS NULL',
    );
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'payment.company_id = :companyId',
      { companyId: 'company-1' },
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

    paymentsRepository.findOne!.mockResolvedValue(payment);
    jest.spyOn(service, 'findOne').mockResolvedValue(confirmedPayment);

    _invoicesRepository.findOne!.mockResolvedValue({
      id: 'inv-1',
      tenantAccountId: 'acc-from-invoice',
    });

    (
      tenantAccountsService.addMovementWithManager as jest.Mock
    ).mockResolvedValue({ id: 'mov-1' });

    jest.spyOn(service as any, 'applyPaymentToInvoices').mockResolvedValue([]);
    jest
      .spyOn(service as any, 'createCreditNotesForSettledLateFees')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'generateReceipt')
      .mockResolvedValue({ id: 'rec-1' } as Receipt);

    paymentsRepository.update!.mockResolvedValue({ affected: 1 });

    const result = await service.confirm('pay-1', 'company-1');

    expect(service.findOne).toHaveBeenNthCalledWith(1, 'pay-1', 'company-1');
    expect(tenantAccountsService.addMovementWithManager).toHaveBeenCalledWith(
      expect.anything(),
      'acc-from-invoice',
      expect.anything(),
      -100,
      'payment',
      'pay-1',
      expect.stringContaining('Pago recibido'),
      'company-1',
    );
    expect(paymentsRepository.update).toHaveBeenCalledWith('pay-1', {
      status: PaymentStatus.COMPLETED,
      tenantAccountId: 'acc-from-invoice',
      allocationsRecorded: true,
    });
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

    paymentsRepository.findOne!.mockResolvedValue(payment);

    await expect(service.confirm('pay-1', 'company-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(paymentsRepository.update).not.toHaveBeenCalled();
    expect(tenantAccountsService.addMovementWithManager).not.toHaveBeenCalled();
  });

  it('commits payment ledger, invoice allocation and receipt together', async () => {
    const payment = {
      id: 'pay-atomic',
      status: PaymentStatus.PENDING,
      amount: 100,
      method: 'cash',
      tenantAccountId: 'acc-1',
      companyId: 'company-1',
      currencyCode: 'ARS',
    } as unknown as Payment;
    const receipt = {
      id: 'receipt-1',
      paymentId: payment.id,
      receiptNumber: 'REC-202609-0001',
      pdfUrl: null,
    } as unknown as Receipt;
    paymentsRepository.findOne!.mockResolvedValue(payment);
    paymentsRepository.update!.mockResolvedValue({ affected: 1 });
    _invoicesRepository.find!.mockResolvedValue([]);
    receiptsRepository
      .findOne!.mockResolvedValueOnce(null)
      .mockResolvedValueOnce(receipt);
    receiptsRepository.find!.mockResolvedValue([]);
    receiptsRepository.create!.mockImplementation((data) => data);
    receiptsRepository.save!.mockImplementation(async (data) => ({
      ...data,
      id: data.id ?? 'receipt-1',
    }));
    (
      tenantAccountsService.addMovementWithManager as jest.Mock
    ).mockResolvedValue({ id: 'movement-1' });
    jest.spyOn(service, 'findOne').mockResolvedValue({
      ...payment,
      status: PaymentStatus.COMPLETED,
    } as Payment);
    (service as any).receiptPdfService.generate.mockResolvedValue(
      'db://document/receipt-1',
    );

    await service.confirm(payment.id, payment.companyId);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(paymentsRepository.findOne).toHaveBeenCalledWith({
      where: { id: payment.id, companyId: payment.companyId },
      lock: { mode: 'pessimistic_write' },
    });
    expect(tenantAccountsService.addMovementWithManager).toHaveBeenCalled();
    expect(receiptsRepository.save).toHaveBeenCalled();
    expect(paymentsRepository.update).toHaveBeenCalledWith(payment.id, {
      tenantAccountId: 'acc-1',
      status: PaymentStatus.COMPLETED,
      allocationsRecorded: true,
    });
    expect((service as any).receiptPdfService.generate).toHaveBeenCalled();
  });

  it('aborts confirmation before receipt and status when ledger write fails', async () => {
    paymentsRepository.findOne!.mockResolvedValue({
      id: 'pay-rollback',
      status: PaymentStatus.PENDING,
      amount: 100,
      method: 'cash',
      tenantAccountId: 'acc-1',
      companyId: 'company-1',
    } as Payment);
    (
      tenantAccountsService.addMovementWithManager as jest.Mock
    ).mockRejectedValue(new Error('ledger failed'));

    await expect(service.confirm('pay-rollback', 'company-1')).rejects.toThrow(
      'ledger failed',
    );
    expect(receiptsRepository.save).not.toHaveBeenCalled();
    expect(paymentsRepository.update).not.toHaveBeenCalled();
  });

  it('should throw when creating without amount and without items', async () => {
    (tenantAccountsService.findOne as jest.Mock).mockResolvedValue({
      id: 'acc-1',
      companyId: 'company-1',
      tenantId: 'tenant-1',
    });

    await expect(
      service.create(
        {
          tenantAccountId: 'acc-1',
          amount: undefined as any,
          currencyCode: 'ARS',
          paymentDate: '2025-01-10',
          method: 'cash',
        } as any,
        undefined,
        'company-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should throw when amount does not match item total', async () => {
    (tenantAccountsService.findOne as jest.Mock).mockResolvedValue({
      id: 'acc-1',
      companyId: 'company-1',
      tenantId: 'tenant-1',
    });

    await expect(
      service.create(
        {
          tenantAccountId: 'acc-1',
          amount: 999,
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
          ],
        } as any,
        undefined,
        'company-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should throw when canceling an already cancelled payment', async () => {
    paymentsRepository.findOne!.mockResolvedValue({
      id: 'pay-1',
      status: PaymentStatus.CANCELLED,
    } as Payment);

    await expect(service.cancel('pay-1', 'company-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should revert account movement when canceling completed payment', async () => {
    const completed = {
      id: 'pay-2',
      status: PaymentStatus.COMPLETED,
      amount: 150,
      tenantAccountId: 'acc-1',
      companyId: 'company-1',
      allocationsRecorded: true,
    } as Payment;
    const cancelled = {
      ...completed,
      status: PaymentStatus.CANCELLED,
    } as Payment;
    paymentsRepository.findOne!.mockResolvedValue(completed);
    jest.spyOn(service, 'findOne').mockResolvedValue(cancelled);
    paymentsRepository.update!.mockResolvedValue({ affected: 1 });

    const result = await service.cancel('pay-2', 'company-1');

    expect(service.findOne).toHaveBeenNthCalledWith(1, 'pay-2', 'company-1');
    expect(tenantAccountsService.addMovementWithManager).toHaveBeenCalledWith(
      expect.anything(),
      'acc-1',
      expect.anything(),
      150,
      'payment',
      'pay-2',
      'Anulación pago',
      'company-1',
    );
    expect(result.status).toBe(PaymentStatus.CANCELLED);
  });

  it('fails closed when a legacy payment has no allocation history', async () => {
    paymentsRepository.findOne!.mockResolvedValue({
      id: 'legacy-payment',
      status: PaymentStatus.COMPLETED,
      allocationsRecorded: false,
      companyId: 'company-1',
    } as Payment);

    await expect(service.cancel('legacy-payment', 'company-1')).rejects.toThrow(
      'requires manual reversal',
    );
    expect(tenantAccountsService.addMovementWithManager).not.toHaveBeenCalled();
    expect(paymentsRepository.update).not.toHaveBeenCalled();
  });

  it('should list and resolve credit notes by id', async () => {
    _creditNotesRepository.find!.mockResolvedValue([{ id: 'cn-1' }]);
    await expect(
      service.listCreditNotesByInvoice('inv-1', 'company-1'),
    ).resolves.toEqual([{ id: 'cn-1' }]);

    _creditNotesRepository.findOne!.mockResolvedValueOnce(null);
    await expect(
      service.findCreditNoteById('missing', 'company-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should apply filters and owner visibility scope in findAll', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    paymentsRepository.createQueryBuilder!.mockReturnValue(qb as any);

    await service.findAll(
      {
        tenantId: 'tenant-1',
        tenantAccountId: 'acc-1',
        leaseId: 'lease-1',
        status: PaymentStatus.PENDING,
        method: 'cash',
        fromDate: '2025-01-01',
        toDate: '2025-01-31',
        page: 2,
        limit: 10,
      } as any,
      {
        id: 'owner-1',
        companyId: 'company-1',
        role: UserRole.OWNER,
        email: 'OWNER@MAIL.COM',
        phone: '123',
      },
    );

    expect(qb.andWhere).toHaveBeenCalledWith(
      '(payment.tenant_id = :tenantId OR tenant.user_id = :tenantId)',
      { tenantId: 'tenant-1' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('owner.user_id = :scopeUserId'),
      expect.objectContaining({
        scopeUserId: 'owner-1',
        scopeEmail: 'owner@mail.com',
      }),
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'payment.company_id = :companyId',
      { companyId: 'company-1' },
    );
    expect(qb.skip).toHaveBeenCalledWith(10);
  });

  it('should apply tenant visibility scope in findAll', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    paymentsRepository.createQueryBuilder!.mockReturnValue(qb as any);

    await service.findAll({} as any, {
      id: 'tenant-user-1',
      companyId: 'company-1',
      role: UserRole.TENANT,
      email: 'tenant@test.dev',
      phone: '555',
    });

    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('tenant.user_id = :scopeUserId'),
      expect.objectContaining({ scopeUserId: 'tenant-user-1' }),
    );
  });

  it('should throw not found for missing findOneScoped payment', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    paymentsRepository.createQueryBuilder!.mockReturnValue(qb as any);

    await expect(
      service.findOneScoped('missing', {
        id: 'admin-1',
        companyId: 'company-1',
        role: UserRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should throw when confirming non-pending payment', async () => {
    paymentsRepository.findOne!.mockResolvedValue({
      id: 'pay-1',
      status: PaymentStatus.COMPLETED,
    } as Payment);

    await expect(service.confirm('pay-1', 'company-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should cancel pending payment without reverting movement', async () => {
    const pending = {
      id: 'pay-3',
      status: PaymentStatus.PENDING,
    } as Payment;
    const cancelled = {
      ...pending,
      status: PaymentStatus.CANCELLED,
    } as Payment;
    paymentsRepository.findOne!.mockResolvedValue(pending);
    jest.spyOn(service, 'findOne').mockResolvedValue(cancelled);
    paymentsRepository.update!.mockResolvedValue({ affected: 1 });

    const result = await service.cancel('pay-3', 'company-1');

    expect(tenantAccountsService.addMovementWithManager).not.toHaveBeenCalled();
    expect(result.status).toBe(PaymentStatus.CANCELLED);
  });

  it('reverses allocations, credit notes and receipt when cancelling', async () => {
    const completed = {
      id: 'pay-reverse',
      status: PaymentStatus.COMPLETED,
      amount: 150,
      tenantAccountId: 'acc-1',
      companyId: 'company-1',
      allocationsRecorded: true,
    } as Payment;
    const allocation = {
      id: 'allocation-1',
      companyId: 'company-1',
      paymentId: completed.id,
      invoiceId: 'invoice-1',
      amount: 100,
      previousInvoiceStatus: InvoiceStatus.OVERDUE,
      reversedAt: null,
    } as PaymentAllocation;
    const invoice = {
      id: 'invoice-1',
      companyId: 'company-1',
      amountPaid: 100,
      status: InvoiceStatus.PAID,
    } as Invoice;
    const note = {
      id: 'note-1',
      companyId: 'company-1',
      paymentId: completed.id,
      tenantAccountId: 'acc-1',
      amount: 10,
      noteNumber: 'NC-1',
      status: CreditNoteStatus.ISSUED,
    } as CreditNote;
    const receipt = {
      id: 'receipt-1',
      companyId: 'company-1',
      paymentId: completed.id,
      cancelledAt: null,
    } as Receipt;
    paymentsRepository.findOne!.mockResolvedValue(completed);
    paymentsRepository.update!.mockResolvedValue({ affected: 1 });
    paymentAllocationsRepository.find!.mockResolvedValue([allocation]);
    paymentAllocationsRepository.save!.mockImplementation(async (item) => item);
    _invoicesRepository.findOne!.mockResolvedValue(invoice);
    _invoicesRepository.save!.mockImplementation(async (item) => item);
    _creditNotesRepository.find!.mockResolvedValue([note]);
    _creditNotesRepository.save!.mockImplementation(async (item) => item);
    receiptsRepository.findOne!.mockResolvedValue(receipt);
    receiptsRepository.save!.mockImplementation(async (item) => item);
    (
      tenantAccountsService.addMovementWithManager as jest.Mock
    ).mockResolvedValue({ id: 'movement-1' });
    jest.spyOn(service, 'findOne').mockResolvedValue({
      ...completed,
      status: PaymentStatus.CANCELLED,
    } as Payment);

    await service.cancel(completed.id, completed.companyId);

    expect(invoice.amountPaid).toBe(0);
    expect(invoice.status).toBe(InvoiceStatus.OVERDUE);
    expect(allocation.reversedAt).toBeInstanceOf(Date);
    expect(note.status).toBe(CreditNoteStatus.CANCELLED);
    expect(receipt.cancelledAt).toBeInstanceOf(Date);
    expect(tenantAccountsService.addMovementWithManager).toHaveBeenCalledWith(
      expect.anything(),
      'acc-1',
      MovementType.ADJUSTMENT,
      10,
      'credit_note_cancellation',
      'note-1',
      expect.stringContaining('NC-1'),
      'company-1',
    );
  });

  it('should throw when item total is not greater than zero', async () => {
    (tenantAccountsService.findOne as jest.Mock).mockResolvedValue({
      id: 'acc-1',
      companyId: 'company-1',
      tenantId: 'tenant-1',
    });

    await expect(
      service.create(
        {
          tenantAccountId: 'acc-1',
          paymentDate: '2025-01-10',
          method: 'cash',
          items: [
            {
              description: 'Descuento total',
              amount: 100,
              quantity: 1,
              type: PaymentItemType.DISCOUNT,
            },
          ],
        } as any,
        undefined,
        'company-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should update amount directly when dto has amount and no items', async () => {
    const payment = {
      id: 'pay-4',
      status: PaymentStatus.PENDING,
      amount: 100,
    } as Payment;
    const updated = { ...payment, amount: 250 } as Payment;
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValueOnce(payment)
      .mockResolvedValueOnce(updated);
    paymentsRepository.save!.mockResolvedValue(updated);

    const result = await service.update(
      'pay-4',
      { amount: 250 } as any,
      'company-1',
    );

    expect(paymentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pay-4', amount: 250 }),
    );
    expect(result.amount).toBe(250);
  });

  it('should throw not found when findOne misses payment', async () => {
    paymentsRepository.findOne!.mockResolvedValue(null);
    await expect(
      service.findOne('missing', 'company-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(paymentsRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'missing', companyId: 'company-1' },
      }),
    );
  });

  it('should apply payment to invoices with paid and partial outcomes', async () => {
    const invoices = [
      {
        id: 'inv-paid',
        total: 100,
        amountPaid: 0,
        lateFee: 10,
        status: InvoiceStatus.PENDING,
      },
      {
        id: 'inv-partial',
        total: 200,
        amountPaid: 0,
        lateFee: 0,
        status: InvoiceStatus.PENDING,
      },
    ] as any[];
    _invoicesRepository.find!.mockResolvedValue(invoices);
    _invoicesRepository.save!.mockImplementation(async (invoice) => invoice);

    const settled = await (service as any).applyPaymentToInvoices(
      { amount: 150 } as Payment,
      'acc-1',
    );

    expect(_invoicesRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantAccountId: 'acc-1' }),
      }),
    );
    expect(invoices[0].status).toBe(InvoiceStatus.PAID);
    expect(invoices[1].status).toBe(InvoiceStatus.PARTIAL);
    expect(settled).toHaveLength(1);
    expect(settled[0].id).toBe('inv-paid');
  });

  it('records each FIFO invoice allocation for exact reversal', async () => {
    const invoice = {
      id: 'invoice-1',
      total: 100,
      amountPaid: 25,
      lateFee: 0,
      status: InvoiceStatus.PARTIAL,
    } as Invoice;
    _invoicesRepository.find!.mockResolvedValue([invoice]);
    _invoicesRepository.save!.mockImplementation(async (item) => item);
    paymentAllocationsRepository.create!.mockImplementation((item) => item);
    paymentAllocationsRepository.save!.mockImplementation(async (item) => item);

    await (service as any).applyPaymentToInvoices(
      { id: 'payment-1', companyId: 'company-1', amount: 50 } as Payment,
      'account-1',
      _invoicesRepository,
      paymentAllocationsRepository,
    );

    expect(paymentAllocationsRepository.create).toHaveBeenCalledWith({
      companyId: 'company-1',
      paymentId: 'payment-1',
      invoiceId: 'invoice-1',
      amount: 50,
      previousInvoiceStatus: InvoiceStatus.PARTIAL,
      reversedAt: null,
    });
  });

  it('should return existing receipt when already generated', async () => {
    receiptsRepository.findOne!.mockResolvedValue({ id: 'r-existing' });

    const result = await (service as any).generateReceipt({
      id: 'pay-1',
    } as Payment);

    expect(result).toEqual({ id: 'r-existing' });
    expect(receiptsRepository.create).not.toHaveBeenCalled();
  });

  it('should generate receipt and dispatch a consent-aware communication', async () => {
    receiptsRepository.findOne!.mockResolvedValue(null);
    receiptsRepository.find!.mockResolvedValue([
      { receiptNumber: 'REC-202502-0007' },
    ]);
    receiptsRepository.create!.mockImplementation((data) => data);
    receiptsRepository
      .save!.mockResolvedValueOnce({
        id: 'r-new',
        receiptNumber: 'REC-202502-0008',
      })
      .mockResolvedValueOnce({
        id: 'r-new',
        receiptNumber: 'REC-202502-0008',
        pdfUrl: 'https://pdf.local/r-new.pdf',
      });

    const receiptPdfService = (service as any).receiptPdfService;
    receiptPdfService.generate.mockResolvedValue('https://pdf.local/r-new.pdf');
    const communicationsService = (service as any).communicationsService;
    communicationsService.dispatchEvent.mockResolvedValue({ status: 'sent' });

    const payment = {
      id: 'pay-1',
      companyId: 'company-1',
      amount: 100,
      currencyCode: 'ARS',
      tenant: {
        id: 'tenant-1',
        contactConsent: true,
        preferredContactChannel: 'whatsapp',
        user: {
          firstName: 'Ana',
          lastName: 'Pérez',
          phone: '5491112345678',
          language: 'es',
        },
      },
    } as any as Payment;

    const result = await (service as any).generateReceipt(payment);

    expect(receiptPdfService.generate).toHaveBeenCalled();
    expect(communicationsService.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'payment_received',
        recipientRole: 'tenant',
        recipient: '5491112345678',
        consented: true,
        relatedEntityId: 'pay-1',
        metadata: expect.objectContaining({
          attachmentUrl: 'https://pdf.local/r-new.pdf',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'r-new',
        pdfUrl: 'https://pdf.local/r-new.pdf',
      }),
    );
  });

  it('should create credit note for settled late fee and register movement', async () => {
    _creditNotesRepository.findOne!.mockResolvedValueOnce(null);
    _creditNotesRepository.find!.mockResolvedValue([
      { noteNumber: 'NC-202502-0003' },
    ]);
    _creditNotesRepository.create!.mockImplementation((data) => data);
    _creditNotesRepository
      .save!.mockResolvedValueOnce({
        id: 'cn-1',
        noteNumber: 'NC-202502-0004',
        amount: 50,
        currencyCode: 'ARS',
      })
      .mockResolvedValueOnce({
        id: 'cn-1',
        noteNumber: 'NC-202502-0004',
        amount: 50,
        currencyCode: 'ARS',
        pdfUrl: 'https://pdf.local/cn-1.pdf',
      });
    _invoicesRepository.findOne!.mockResolvedValue({
      id: 'inv-1',
      lease: { tenant: { user: { phone: '5491112345678' } } },
    } as any);

    const creditNotePdfService = (service as any).creditNotePdfService;
    creditNotePdfService.generate.mockResolvedValue(
      'https://pdf.local/cn-1.pdf',
    );
    const whatsappService = (service as any).whatsappService;
    whatsappService.sendTemplateMessage.mockResolvedValue({ ok: true });

    await (service as any).createCreditNotesForSettledLateFees(
      {
        id: 'pay-1',
        companyId: 'company-1',
        currencyCode: 'ARS',
      } as Payment,
      'acc-1',
      [
        {
          id: 'inv-1',
          lateFee: 50,
          currencyCode: 'ARS',
          invoiceNumber: 'FAC-1',
        } as any,
      ],
    );

    expect(_creditNotesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 'inv-1',
        paymentId: 'pay-1',
        tenantAccountId: 'acc-1',
        status: CreditNoteStatus.ISSUED,
      }),
    );
    expect(tenantAccountsService.addMovement).toHaveBeenCalledWith(
      'acc-1',
      expect.anything(),
      -50,
      'credit_note',
      'cn-1',
      expect.stringContaining('Nota de crédito'),
      'company-1',
    );
  });

  it('should skip credit note creation when one already exists', async () => {
    _creditNotesRepository.findOne!.mockResolvedValue({ id: 'existing-cn' });

    await (service as any).createCreditNotesForSettledLateFees(
      {
        id: 'pay-1',
        companyId: 'company-1',
        currencyCode: 'ARS',
      } as Payment,
      'acc-1',
      [{ id: 'inv-1', lateFee: 20 } as any],
    );

    expect(_creditNotesRepository.create).not.toHaveBeenCalled();
    expect(tenantAccountsService.addMovement).not.toHaveBeenCalledWith(
      'acc-1',
      expect.anything(),
      -20,
      'credit_note',
      expect.anything(),
      expect.anything(),
    );
  });
});
