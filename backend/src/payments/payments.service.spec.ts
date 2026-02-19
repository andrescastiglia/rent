import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentsService } from './payments.service';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { PaymentItem, PaymentItemType } from './entities/payment-item.entity';
import { Receipt } from './entities/receipt.entity';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { CreditNote, CreditNoteStatus } from './entities/credit-note.entity';
import { TenantAccountsService } from './tenant-accounts.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { CreditNotePdfService } from './credit-note-pdf.service';
import { UserRole } from '../users/entities/user.entity';
import { WhatsappService } from '../whatsapp/whatsapp.service';

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
        {
          provide: WhatsappService,
          useValue: { sendTextMessage: jest.fn() },
        },
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

    paymentsRepository.update!.mockResolvedValue({ affected: 1 });

    const result = await service.confirm('pay-1');

    expect(tenantAccountsService.addMovement).toHaveBeenCalledWith(
      'acc-from-invoice',
      expect.anything(),
      -100,
      'payment',
      'pay-1',
      expect.stringContaining('Pago recibido'),
    );
    expect(paymentsRepository.update).toHaveBeenCalledWith('pay-1', {
      status: PaymentStatus.COMPLETED,
      tenantAccountId: 'acc-from-invoice',
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

    jest.spyOn(service, 'findOne').mockResolvedValue(payment);

    await expect(service.confirm('pay-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(paymentsRepository.update).not.toHaveBeenCalled();
    expect(tenantAccountsService.addMovement).not.toHaveBeenCalled();
  });

  it('should throw when creating without amount and without items', async () => {
    (tenantAccountsService.findOne as jest.Mock).mockResolvedValue({
      id: 'acc-1',
      companyId: 'company-1',
      tenantId: 'tenant-1',
    });

    await expect(
      service.create({
        tenantAccountId: 'acc-1',
        amount: undefined as any,
        currencyCode: 'ARS',
        paymentDate: '2025-01-10',
        method: 'cash',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should throw when amount does not match item total', async () => {
    (tenantAccountsService.findOne as jest.Mock).mockResolvedValue({
      id: 'acc-1',
      companyId: 'company-1',
      tenantId: 'tenant-1',
    });

    await expect(
      service.create({
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
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should throw when canceling an already cancelled payment', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'pay-1',
      status: PaymentStatus.CANCELLED,
    } as Payment);

    await expect(service.cancel('pay-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should revert account movement when canceling completed payment', async () => {
    const completed = {
      id: 'pay-2',
      status: PaymentStatus.COMPLETED,
      amount: 150,
      tenantAccountId: 'acc-1',
    } as Payment;
    const cancelled = {
      ...completed,
      status: PaymentStatus.CANCELLED,
    } as Payment;
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValueOnce(completed)
      .mockResolvedValueOnce(cancelled);
    paymentsRepository.update!.mockResolvedValue({ affected: 1 });

    const result = await service.cancel('pay-2');

    expect(tenantAccountsService.addMovement).toHaveBeenCalledWith(
      'acc-1',
      expect.anything(),
      150,
      'payment',
      'pay-2',
      'Anulación pago',
    );
    expect(result.status).toBe(PaymentStatus.CANCELLED);
  });

  it('should list and resolve credit notes by id', async () => {
    _creditNotesRepository.find!.mockResolvedValue([{ id: 'cn-1' }]);
    await expect(service.listCreditNotesByInvoice('inv-1')).resolves.toEqual([
      { id: 'cn-1' },
    ]);

    _creditNotesRepository.findOne!.mockResolvedValueOnce(null);
    await expect(service.findCreditNoteById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
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
        role: UserRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should throw when confirming non-pending payment', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'pay-1',
      status: PaymentStatus.COMPLETED,
    } as Payment);

    await expect(service.confirm('pay-1')).rejects.toBeInstanceOf(
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
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(cancelled);
    paymentsRepository.update!.mockResolvedValue({ affected: 1 });

    const result = await service.cancel('pay-3');

    expect(tenantAccountsService.addMovement).not.toHaveBeenCalled();
    expect(result.status).toBe(PaymentStatus.CANCELLED);
  });

  it('should throw when item total is not greater than zero', async () => {
    (tenantAccountsService.findOne as jest.Mock).mockResolvedValue({
      id: 'acc-1',
      companyId: 'company-1',
      tenantId: 'tenant-1',
    });

    await expect(
      service.create({
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
      } as any),
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

    const result = await service.update('pay-4', { amount: 250 } as any);

    expect(paymentsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pay-4', amount: 250 }),
    );
    expect(result.amount).toBe(250);
  });

  it('should throw not found when findOne misses payment', async () => {
    paymentsRepository.findOne!.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
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

  it('should return existing receipt when already generated', async () => {
    receiptsRepository.findOne!.mockResolvedValue({ id: 'r-existing' });

    const result = await (service as any).generateReceipt({
      id: 'pay-1',
    } as Payment);

    expect(result).toEqual({ id: 'r-existing' });
    expect(receiptsRepository.create).not.toHaveBeenCalled();
  });

  it('should generate receipt, store pdf and send whatsapp when phone is available', async () => {
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
    const whatsappService = (service as any).whatsappService;
    whatsappService.sendTextMessage.mockResolvedValue({ ok: true });

    const payment = {
      id: 'pay-1',
      companyId: 'company-1',
      amount: 100,
      currencyCode: 'ARS',
      tenant: { user: { phone: '5491112345678' } },
    } as any as Payment;

    const result = await (service as any).generateReceipt(payment);

    expect(receiptPdfService.generate).toHaveBeenCalled();
    expect(whatsappService.sendTextMessage).toHaveBeenCalledWith(
      '5491112345678',
      expect.stringContaining('Tu recibo'),
      'https://pdf.local/r-new.pdf',
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
    whatsappService.sendTextMessage.mockResolvedValue({ ok: true });

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
