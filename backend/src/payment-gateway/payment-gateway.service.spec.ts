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
  let dataSource: { query: jest.Mock };
  let configService: { get: jest.Mock };
  let httpService: { post: jest.Mock; get: jest.Mock };

  const mockInvoice = {
    id: 'invoice-uuid-1234',
    companyId: 'company-uuid-1234',
    invoiceNumber: 'FAC-001',
    total: 50000,
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
    dataSource = { query: jest.fn().mockResolvedValue([]) };
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

      await service.processWebhook(baseNotification);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('WITH transitioned AS'),
        [
          PaymentGatewayTransactionStatus.APPROVED,
          mpPayment.id,
          mpPayment.payment_method_id,
          mpPayment.installments,
          mockTransaction.id,
          mockTransaction.companyId,
          InvoiceStatus.PAID,
          mockTransaction.invoiceId,
        ],
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

      await service.processWebhook(baseNotification);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('WITH transitioned AS'),
        expect.arrayContaining([
          PaymentGatewayTransactionStatus.REJECTED,
          mockTransaction.id,
          mockTransaction.companyId,
        ]),
      );
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
