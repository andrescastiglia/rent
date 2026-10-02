import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { AxiosResponse } from 'axios';
import { PaymentsService } from '../payments/payments.service';
import { throwError } from 'rxjs';
import { PaymentGatewayService } from './payment-gateway.service';
import {
  PaymentGatewayTransaction,
  PaymentGatewayTransactionStatus,
} from './entities/payment-gateway-transaction.entity';
import { Invoice, InvoiceStatus } from '../payments/entities/invoice.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { UserRole } from '../users/entities/user.entity';
import { CreatePaymentPreferenceDto } from './dto/create-payment-preference.dto';
import { WebhookNotificationDto } from './dto/webhook-notification.dto';

type MockRepository<T extends Record<string, any> = any> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

const createMockRepository = (): MockRepository => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
});

describe('PaymentGatewayService', () => {
  let service: PaymentGatewayService;
  let txRepo: MockRepository<PaymentGatewayTransaction>;
  let invoiceRepo: MockRepository<Invoice>;
  let tenantRepo: MockRepository<Tenant>;
  let dataSource: { query: jest.Mock; transaction: jest.Mock };
  let canonical: {
    createWithManager: jest.Mock;
    confirmWithManager: jest.Mock;
    refundWithManager: jest.Mock;
  };
  let canonicalRepository: { update: jest.Mock };
  let configService: { get: jest.Mock };
  let httpService: { post: jest.Mock; get: jest.Mock };

  const mockInvoice = {
    id: 'invoice-uuid-1234',
    companyId: 'company-uuid-1234',
    invoiceNumber: 'FAC-001',
    total: 50000,
    amountPaid: 0,
    status: InvoiceStatus.PENDING,
    tenantAccountId: 'account-1',
    currencyCode: 'ARS',
    tenantAccount: { tenantId: 'tenant-uuid-1234' },
  } as unknown as Invoice;

  const mockTransaction = {
    id: 'tx-uuid-1234',
    companyId: 'company-uuid-1234',
    invoiceId: 'invoice-uuid-1234',
    tenantId: 'tenant-uuid-1234',
    status: PaymentGatewayTransactionStatus.PENDING,
    externalId: 'pref-123',
    amount: 50000,
    currency: 'ARS',
    initPoint:
      'https://www.mercadopago.com/checkout/v1/redirect?pref_id=pref-123',
    sandboxInitPoint:
      'https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=pref-123',
    metadata: {},
  } as unknown as PaymentGatewayTransaction;

  beforeEach(async () => {
    txRepo = createMockRepository();
    invoiceRepo = createMockRepository();
    tenantRepo = createMockRepository();
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === PaymentGatewayTransaction
          ? txRepo
          : entity === Invoice
            ? invoiceRepo
            : canonicalRepository,
      ),
      query: jest.fn().mockResolvedValue([]),
    };
    canonicalRepository = { update: jest.fn() };
    canonical = {
      createWithManager: jest
        .fn()
        .mockResolvedValue({ id: 'canonical-payment' }),
      confirmWithManager: jest.fn(),
      refundWithManager: jest.fn(),
    };
    dataSource = {
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(async (work) => work(manager)),
    };
    configService = { get: jest.fn() };
    httpService = { post: jest.fn(), get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentGatewayService,
        {
          provide: getRepositoryToken(PaymentGatewayTransaction),
          useValue: txRepo,
        },
        { provide: getRepositoryToken(Invoice), useValue: invoiceRepo },
        { provide: getRepositoryToken(Tenant), useValue: tenantRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: configService },
        { provide: HttpService, useValue: httpService },
        { provide: PaymentsService, useValue: canonical },
      ],
    }).compile();

    service = module.get<PaymentGatewayService>(PaymentGatewayService);
  });

  describe('createPreference', () => {
    const dto: CreatePaymentPreferenceDto = { invoiceId: 'invoice-uuid-1234' };
    const companyId = 'company-uuid-1234';
    const userId = 'user-uuid-1234';

    it('should create a preference and return init points', async () => {
      invoiceRepo.findOne!.mockResolvedValue(mockInvoice);
      configService.get.mockImplementation((key: string) => {
        if (key === 'MERCADOPAGO_ACCESS_TOKEN') return 'TEST_TOKEN';
        if (key === 'APP_URL') return 'https://app.example.com';
        return undefined;
      });

      const mpResponse = {
        id: 'pref-123',
        init_point:
          'https://www.mercadopago.com/checkout/v1/redirect?pref_id=pref-123',
        sandbox_init_point:
          'https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=pref-123',
      };

      httpService.post.mockReturnValue(
        of({ data: mpResponse } as AxiosResponse),
      );
      txRepo.create!.mockImplementation((value) => value);
      txRepo.save!.mockImplementation(async (value) => value);

      const result = await service.createPreference(companyId, userId, dto);

      expect(result).toEqual({
        initPoint: mpResponse.init_point,
        sandboxInitPoint: mpResponse.sandbox_init_point,
        transactionId: expect.any(String),
      });

      expect(httpService.post).toHaveBeenCalledWith(
        'https://api.mercadopago.com/checkout/preferences',
        expect.objectContaining({
          items: [
            expect.objectContaining({
              title: `Alquiler - ${mockInvoice.invoiceNumber}`,
              unit_price: Number(mockInvoice.total),
            }),
          ],
          external_reference: expect.any(String),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer TEST_TOKEN',
          }),
        }),
      );

      const preferenceBody = httpService.post.mock.calls[0][1];
      expect(result.transactionId).toBe(preferenceBody.external_reference);
      expect(txRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: preferenceBody.external_reference,
          invoiceId: mockInvoice.id,
          companyId,
        }),
      );
      expect(txRepo.save).toHaveBeenCalled();
    });

    it('persists the outstanding amount before contacting the provider', async () => {
      invoiceRepo.findOne!.mockResolvedValue({
        ...mockInvoice,
        amountPaid: 12500,
        status: InvoiceStatus.PARTIAL,
      });
      txRepo.create!.mockImplementation((value) => value);
      txRepo.save!.mockImplementation(async (value) => value);
      configService.get.mockReturnValue('configured');
      httpService.post.mockImplementation(() => {
        expect(txRepo.save).toHaveBeenCalled();
        return of({
          data: {
            id: 'pref',
            init_point: 'https://mp/pay',
            sandbox_init_point: 'https://mp/test',
          },
        } as AxiosResponse);
      });
      await service.createPreference(companyId, userId, dto);
      expect(httpService.post.mock.calls[0][1].items[0].unit_price).toBe(37500);
    });

    it('preserves the intention on a lost provider response and refuses another submission', async () => {
      invoiceRepo.findOne!.mockResolvedValue(mockInvoice);
      txRepo.create!.mockImplementation((value) => value);
      txRepo.save!.mockImplementation(async (value) => value);
      configService.get.mockReturnValue('configured');
      httpService.post.mockReturnValue(
        throwError(() => new Error('lost response')),
      );
      const key = '5a84029c-5728-4d1f-8c17-b2ea0d49771c';
      await expect(
        service.createPreference(companyId, userId, dto, undefined, key),
      ).rejects.toThrow('uncertain provider result');
      const intent = txRepo.save!.mock.calls[0][0];
      txRepo.findOne!.mockResolvedValue(intent);
      await expect(
        service.createPreference(companyId, userId, dto, undefined, key),
      ).rejects.toThrow('requires provider reconciliation');
      expect(httpService.post).toHaveBeenCalledTimes(1);
    });

    it('recovers a ready checkout by the same request key without contacting the provider', async () => {
      invoiceRepo.findOne!.mockResolvedValue(mockInvoice);
      configService.get.mockReturnValue('configured');
      txRepo.findOne!.mockResolvedValue({
        ...mockTransaction,
        metadata: {
          requestedBy: userId,
          successUrl: 'configured/payment/success',
          failureUrl: 'configured/payment/failure',
          pendingUrl: 'configured/payment/pending',
        },
      });
      const result = await service.createPreference(
        companyId,
        userId,
        dto,
        undefined,
        '5a84029c-5728-4d1f-8c17-b2ea0d49771c',
      );
      expect(result.transactionId).toBe(mockTransaction.id);
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when invoice not found', async () => {
      invoiceRepo.findOne!.mockResolvedValue(null);
      configService.get.mockReturnValue('TEST_TOKEN');

      await expect(
        service.createPreference(companyId, userId, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException when access token not configured', async () => {
      invoiceRepo.findOne!.mockResolvedValue(mockInvoice);
      configService.get.mockReturnValue(undefined);

      await expect(
        service.createPreference(companyId, userId, dto),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should deny a tenant when the invoice has no tenant account', async () => {
      invoiceRepo.findOne!.mockResolvedValue({
        ...mockInvoice,
        tenantAccount: null,
      });

      await expect(
        service.createPreference(companyId, userId, dto, UserRole.TENANT),
      ).rejects.toThrow(ForbiddenException);
      expect(tenantRepo.findOne).not.toHaveBeenCalled();
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('should deny a tenant when the invoice belongs to another tenant', async () => {
      invoiceRepo.findOne!.mockResolvedValue(mockInvoice);
      tenantRepo.findOne!.mockResolvedValue({
        id: 'another-tenant',
      });

      await expect(
        service.createPreference(companyId, userId, dto, UserRole.TENANT),
      ).rejects.toThrow(ForbiddenException);
      expect(httpService.post).not.toHaveBeenCalled();
    });
  });

  describe('processWebhook', () => {
    const baseNotification: WebhookNotificationDto = {
      id: 'notif-1',
      type: 'payment',
      data: { id: 'payment-456' },
    };

    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'MERCADOPAGO_ACCESS_TOKEN') return 'TEST_TOKEN';
        return undefined;
      });
      dataSource.query.mockImplementation(async (sql: string) =>
        sql.includes('INSERT INTO payment_gateway_webhook_events')
          ? [{ id: 'webhook-event-1' }]
          : [],
      );
    });

    it('should skip non-payment notifications', async () => {
      const notification: WebhookNotificationDto = {
        ...baseNotification,
        type: 'merchant_order',
      };

      await service.processWebhook(notification);

      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('should update transaction and invoice status when payment is approved', async () => {
      const mpPayment = {
        id: 'payment-456',
        status: 'approved',
        external_reference: mockTransaction.id,
        transaction_amount: 50000,
        currency_id: 'ARS',
        payment_method_id: 'credit_card',
        installments: 1,
      };

      httpService.get.mockReturnValue(of({ data: mpPayment } as AxiosResponse));
      txRepo.findOne!.mockResolvedValue(mockTransaction);
      invoiceRepo.findOne!.mockResolvedValue(mockInvoice);

      await service.processWebhook(baseNotification);

      expect(canonical.createWithManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          amount: 50000,
          currencyCode: 'ARS',
          tenantAccountId: 'account-1',
        }),
        undefined,
        mockTransaction.companyId,
      );
      expect(canonicalRepository.update).toHaveBeenCalledWith(
        'canonical-payment',
        expect.objectContaining({
          invoiceId: mockTransaction.invoiceId,
          externalTransactionId: mpPayment.id,
        }),
      );
      expect(canonical.confirmWithManager).toHaveBeenCalledWith(
        expect.anything(),
        'canonical-payment',
        mockTransaction.companyId,
      );
      expect(txRepo.update).toHaveBeenCalledWith(
        mockTransaction.id,
        expect.objectContaining({
          status: PaymentGatewayTransactionStatus.APPROVED,
          paymentId: 'canonical-payment',
        }),
      );
    });

    it('should update only transaction status when payment is rejected', async () => {
      const mpPayment = {
        id: 'payment-456',
        status: 'rejected',
        external_reference: mockTransaction.id,
        transaction_amount: 50000,
        currency_id: 'ARS',
      };

      httpService.get.mockReturnValue(of({ data: mpPayment } as AxiosResponse));
      txRepo.findOne!.mockResolvedValue(mockTransaction);
      invoiceRepo.findOne!.mockResolvedValue(mockInvoice);

      await service.processWebhook(baseNotification);

      expect(txRepo.update).toHaveBeenCalledWith(mockTransaction.id, {
        status: PaymentGatewayTransactionStatus.REJECTED,
      });
      expect(canonical.confirmWithManager).not.toHaveBeenCalled();
    });

    it('should finish safely when no matching transaction is found', async () => {
      const mpPayment = {
        id: 'payment-456',
        status: 'approved',
        external_reference: 'invoice-uuid-1234',
      };

      httpService.get.mockReturnValue(of({ data: mpPayment } as AxiosResponse));
      txRepo.findOne!.mockResolvedValue(null);

      await service.processWebhook(baseNotification);

      expect(txRepo.update).not.toHaveBeenCalled();
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'processed'"),
        expect.any(Array),
      );
    });

    it('does not duplicate accounting on approval replay with another event id', async () => {
      txRepo.findOne!.mockResolvedValue({
        ...mockTransaction,
        status: PaymentGatewayTransactionStatus.APPROVED,
        paymentId: 'canonical-payment',
        externalPaymentId: 'payment-456',
        refundedAmount: 0,
      });
      httpService.get.mockReturnValue(
        of({
          data: {
            id: 'payment-456',
            status: 'approved',
            external_reference: mockTransaction.id,
            transaction_amount: 50000,
            currency_id: 'ARS',
          },
        } as AxiosResponse),
      );
      await service.processWebhook(baseNotification);
      expect(canonical.createWithManager).not.toHaveBeenCalled();
      expect(canonical.confirmWithManager).not.toHaveBeenCalled();
    });

    it('applies only the cumulative partial refund delta', async () => {
      txRepo.findOne!.mockResolvedValue({
        ...mockTransaction,
        status: PaymentGatewayTransactionStatus.APPROVED,
        paymentId: 'canonical-payment',
        externalPaymentId: 'payment-456',
        refundedAmount: 5000,
      });
      httpService.get.mockReturnValue(
        of({
          data: {
            id: 'payment-456',
            status: 'approved',
            external_reference: mockTransaction.id,
            transaction_amount: 50000,
            transaction_amount_refunded: 15000,
            currency_id: 'ARS',
          },
        } as AxiosResponse),
      );
      await service.processWebhook(baseNotification);
      expect(canonical.refundWithManager).toHaveBeenCalledWith(
        expect.anything(),
        'canonical-payment',
        mockTransaction.companyId,
        expect.objectContaining({
          amount: 10000,
          reference: 'mercadopago:payment-456:1500000',
        }),
      );
      expect(txRepo.update).toHaveBeenCalledWith(
        mockTransaction.id,
        expect.objectContaining({
          refundedAmount: 15000,
          status: PaymentGatewayTransactionStatus.APPROVED,
        }),
      );
    });

    it('records approval and refund even when refund arrives before approval', async () => {
      txRepo.findOne!.mockResolvedValue(mockTransaction);
      invoiceRepo.findOne!.mockResolvedValue(mockInvoice);
      httpService.get.mockReturnValue(
        of({
          data: {
            id: 'payment-456',
            status: 'refunded',
            external_reference: mockTransaction.id,
            transaction_amount: 50000,
            currency_id: 'ARS',
          },
        } as AxiosResponse),
      );
      await service.processWebhook(baseNotification);
      expect(canonical.confirmWithManager).toHaveBeenCalled();
      expect(canonical.refundWithManager).toHaveBeenCalledWith(
        expect.anything(),
        'canonical-payment',
        mockTransaction.companyId,
        expect.objectContaining({ amount: 50000 }),
      );
      expect(txRepo.update).toHaveBeenCalledWith(
        mockTransaction.id,
        expect.objectContaining({
          status: PaymentGatewayTransactionStatus.REFUNDED,
        }),
      );
    });

    it('does not persist the gateway status if the common ledger fails', async () => {
      txRepo.findOne!.mockResolvedValue(mockTransaction);
      invoiceRepo.findOne!.mockResolvedValue(mockInvoice);
      canonical.confirmWithManager.mockRejectedValue(
        new Error('ledger failed'),
      );
      httpService.get.mockReturnValue(
        of({
          data: {
            id: 'payment-456',
            status: 'approved',
            external_reference: mockTransaction.id,
            transaction_amount: 50000,
            currency_id: 'ARS',
          },
        } as AxiosResponse),
      );
      await expect(service.processWebhook(baseNotification)).rejects.toThrow(
        'ledger failed',
      );
      expect(txRepo.update).not.toHaveBeenCalled();
    });

    it('rejects a second provider collection for one checkout', async () => {
      txRepo.findOne!.mockResolvedValue({
        ...mockTransaction,
        status: PaymentGatewayTransactionStatus.APPROVED,
        paymentId: 'canonical-payment',
        externalPaymentId: 'another-payment',
      });
      httpService.get.mockReturnValue(
        of({
          data: {
            id: 'payment-456',
            status: 'approved',
            external_reference: mockTransaction.id,
            transaction_amount: 50000,
            currency_id: 'ARS',
          },
        } as AxiosResponse),
      );
      await expect(service.processWebhook(baseNotification)).rejects.toThrow(
        'another approved payment',
      );
      expect(canonical.createWithManager).not.toHaveBeenCalled();
    });

    it('should accept a valid signed notification with numeric ids', async () => {
      const receivedAt = 1_754_000_000_000;
      const timestamp = String(receivedAt);
      const requestId = 'request-123';
      const dataId = '456';
      const secret = 'webhook-secret';
      const digest = createHmac('sha256', secret)
        .update(`id:${dataId};request-id:${requestId};ts:${timestamp};`)
        .digest('hex');

      configService.get.mockImplementation((key: string) => {
        if (key === 'MERCADOPAGO_WEBHOOK_SECRET') return secret;
        if (key === 'MERCADOPAGO_ACCESS_TOKEN') return 'TEST_TOKEN';
        return undefined;
      });
      httpService.get.mockReturnValue(
        of({
          data: {
            id: dataId,
            status: 'approved',
            external_reference: 'invoice-uuid-1234',
          },
        } as AxiosResponse),
      );
      txRepo.findOne!.mockResolvedValue(null);

      await service.processWebhook(
        {
          id: 123,
          live_mode: true,
          type: 'payment',
          data: { id: 456 },
        },
        {
          xSignature: `ts=${timestamp},v1=${digest}`,
          xRequestId: requestId,
          dataId,
          receivedAt,
        },
      );

      expect(httpService.get).toHaveBeenCalledWith(
        `https://api.mercadopago.com/v1/payments/${dataId}`,
        expect.any(Object),
      );
    });

    it('should acknowledge an already processed event without another provider call', async () => {
      dataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('INSERT INTO payment_gateway_webhook_events')) {
          return [];
        }
        if (sql.includes('SELECT status FROM')) {
          return [{ status: 'processed' }];
        }
        return [];
      });

      await service.processWebhook(baseNotification);

      expect(httpService.get).not.toHaveBeenCalled();
      expect(txRepo.findOne).not.toHaveBeenCalled();
    });

    it('should reject concurrent processing until the inbox lease can be reclaimed', async () => {
      dataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('INSERT INTO payment_gateway_webhook_events')) {
          return [];
        }
        if (sql.includes('SELECT status FROM')) {
          return [{ status: 'processing' }];
        }
        return [];
      });

      await expect(service.processWebhook(baseNotification)).rejects.toThrow(
        'already being processed',
      );
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('should reject provider data that does not match the signed event or transaction', async () => {
      httpService.get.mockReturnValueOnce(
        of({
          data: {
            id: 'other-payment',
            status: 'approved',
            external_reference: mockTransaction.invoiceId,
          },
        } as AxiosResponse),
      );
      await expect(service.processWebhook(baseNotification)).rejects.toThrow(
        'does not match the signed notification',
      );

      httpService.get.mockReturnValueOnce(
        of({
          data: {
            id: 'payment-456',
            status: 'approved',
            external_reference: mockTransaction.invoiceId,
            transaction_amount: 49999,
            currency_id: 'ARS',
          },
        } as AxiosResponse),
      );
      txRepo.findOne!.mockResolvedValue(mockTransaction);
      invoiceRepo.findOne!.mockResolvedValue(mockInvoice);
      await expect(service.processWebhook(baseNotification)).rejects.toThrow(
        'amount or currency does not match',
      );
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'failed'"),
        expect.any(Array),
      );
    });

    it('should reject an invalid webhook signature', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'MERCADOPAGO_WEBHOOK_SECRET') return 'webhook-secret';
        return undefined;
      });

      await expect(
        service.processWebhook(baseNotification, {
          xSignature: 'ts=1754000000000,v1=deadbeef',
          xRequestId: 'request-123',
          dataId: baseNotification.data.id,
          receivedAt: 1_754_000_000_000,
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('should reject a signed query id that differs from the payload id', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'MERCADOPAGO_WEBHOOK_SECRET') return 'webhook-secret';
        return undefined;
      });

      await expect(
        service.processWebhook(baseNotification, {
          xSignature: 'ts=1754000000000,v1=deadbeef',
          dataId: 'different-payment-id',
          receivedAt: 1_754_000_000_000,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject malformed webhook payloads', async () => {
      await expect(service.processWebhook({ type: 'payment' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should require a webhook secret in production', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      });

      await expect(service.processWebhook(baseNotification)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all transactions for a company', async () => {
      txRepo.find!.mockResolvedValue([mockTransaction]);

      const result = await service.findAll('company-uuid-1234');

      expect(result).toEqual([mockTransaction]);
      expect(txRepo.find).toHaveBeenCalledWith({
        where: { companyId: 'company-uuid-1234' },
        order: { createdAt: 'DESC' },
      });
    });

    it('should filter by invoiceId when provided', async () => {
      txRepo.find!.mockResolvedValue([mockTransaction]);

      const result = await service.findAll(
        'company-uuid-1234',
        'invoice-uuid-1234',
      );

      expect(result).toEqual([mockTransaction]);
      expect(txRepo.find).toHaveBeenCalledWith({
        where: {
          companyId: 'company-uuid-1234',
          invoiceId: 'invoice-uuid-1234',
        },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a transaction when found', async () => {
      txRepo.findOne!.mockResolvedValue(mockTransaction);
      invoiceRepo.findOne!.mockResolvedValue(mockInvoice);

      const result = await service.findOne('tx-uuid-1234', 'company-uuid-1234');

      expect(result).toEqual(mockTransaction);
    });

    it('should throw NotFoundException when transaction not found', async () => {
      txRepo.findOne!.mockResolvedValue(null);

      await expect(
        service.findOne('nonexistent-id', 'company-uuid-1234'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should deny a tenant when the transaction has no tenant relation', async () => {
      txRepo.findOne!.mockResolvedValue({
        ...mockTransaction,
        tenantId: null,
      });
      tenantRepo.findOne!.mockResolvedValue({ id: 'tenant-uuid-1234' });

      await expect(
        service.findOne('tx-uuid-1234', 'company-uuid-1234', {
          id: 'user-uuid-1234',
          companyId: 'company-uuid-1234',
          role: UserRole.TENANT,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should deny a tenant when the transaction belongs to another tenant', async () => {
      txRepo.findOne!.mockResolvedValue(mockTransaction);
      invoiceRepo.findOne!.mockResolvedValue(mockInvoice);
      tenantRepo.findOne!.mockResolvedValue({ id: 'another-tenant' });

      await expect(
        service.findOne('tx-uuid-1234', 'company-uuid-1234', {
          id: 'user-uuid-1234',
          companyId: 'company-uuid-1234',
          role: UserRole.TENANT,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
