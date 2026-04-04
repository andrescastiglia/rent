import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  InternalServerErrorException,
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
      txRepo.create!.mockReturnValue(mockTransaction);
      txRepo.save!.mockResolvedValue(mockTransaction);

      const result = await service.createPreference(companyId, userId, dto);

      expect(result).toEqual({
        initPoint: mpResponse.init_point,
        sandboxInitPoint: mpResponse.sandbox_init_point,
        transactionId: mockTransaction.id,
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
          external_reference: mockInvoice.id,
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer TEST_TOKEN',
          }),
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
        external_reference: 'invoice-uuid-1234',
        payment_method_id: 'credit_card',
        installments: 1,
      };

      httpService.get.mockReturnValue(of({ data: mpPayment } as AxiosResponse));
      txRepo.findOne!.mockResolvedValue(mockTransaction);
      txRepo.update!.mockResolvedValue({ affected: 1 });
      dataSource.query.mockResolvedValue([]);

      await service.processWebhook(baseNotification);

      expect(txRepo.update).toHaveBeenCalledWith(
        mockTransaction.id,
        expect.objectContaining({
          status: PaymentGatewayTransactionStatus.APPROVED,
        }),
      );

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE invoices'),
        [
          InvoiceStatus.PAID,
          mpPayment.external_reference,
          mockTransaction.companyId,
        ],
      );
    });

    it('should update only transaction status when payment is rejected', async () => {
      const mpPayment = {
        id: 'payment-456',
        status: 'rejected',
        external_reference: 'invoice-uuid-1234',
      };

      httpService.get.mockReturnValue(of({ data: mpPayment } as AxiosResponse));
      txRepo.findOne!.mockResolvedValue(mockTransaction);
      txRepo.update!.mockResolvedValue({ affected: 1 });

      await service.processWebhook(baseNotification);

      expect(txRepo.update).toHaveBeenCalledWith(
        mockTransaction.id,
        expect.objectContaining({
          status: PaymentGatewayTransactionStatus.REJECTED,
        }),
      );
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('should do nothing when no pending transaction found', async () => {
      const mpPayment = {
        id: 'payment-456',
        status: 'approved',
        external_reference: 'invoice-uuid-1234',
      };

      httpService.get.mockReturnValue(of({ data: mpPayment } as AxiosResponse));
      txRepo.findOne!.mockResolvedValue(null);

      await service.processWebhook(baseNotification);

      expect(txRepo.update).not.toHaveBeenCalled();
      expect(dataSource.query).not.toHaveBeenCalled();
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
  });
});
