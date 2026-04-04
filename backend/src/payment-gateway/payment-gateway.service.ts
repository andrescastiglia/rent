import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  PaymentGatewayTransaction,
  PaymentGatewayTransactionStatus,
} from './entities/payment-gateway-transaction.entity';
import { Invoice, InvoiceStatus } from '../payments/entities/invoice.entity';
import { CreatePaymentPreferenceDto } from './dto/create-payment-preference.dto';
import { WebhookNotificationDto } from './dto/webhook-notification.dto';

@Injectable()
export class PaymentGatewayService {
  constructor(
    @InjectRepository(PaymentGatewayTransaction)
    private readonly txRepo: Repository<PaymentGatewayTransaction>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async createPreference(
    companyId: string,
    _userId: string,
    dto: CreatePaymentPreferenceDto,
  ): Promise<{
    initPoint: string;
    sandboxInitPoint: string;
    transactionId: string;
  }> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id: dto.invoiceId, companyId },
      relations: ['tenantAccount'],
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${dto.invoiceId} not found`);
    }

    const accessToken = this.configService.get<string>(
      'MERCADOPAGO_ACCESS_TOKEN',
    );
    if (!accessToken) {
      throw new InternalServerErrorException(
        'MercadoPago access token is not configured',
      );
    }

    const appUrl = this.configService.get<string>('APP_URL', '');
    const successUrl = dto.successUrl ?? `${appUrl}/payment/success`;
    const failureUrl = dto.failureUrl ?? `${appUrl}/payment/failure`;
    const pendingUrl = dto.pendingUrl ?? `${appUrl}/payment/pending`;

    const preferenceBody = {
      items: [
        {
          title: `Alquiler - ${invoice.invoiceNumber}`,
          quantity: 1,
          unit_price: Number(invoice.total),
          currency_id: invoice.currencyCode ?? 'ARS',
        },
      ],
      back_urls: {
        success: successUrl,
        failure: failureUrl,
        pending: pendingUrl,
      },
      auto_return: 'approved',
      notification_url: `${appUrl}/payment-gateway/webhook`,
      external_reference: invoice.id,
    };

    const response = await firstValueFrom(
      this.httpService.post(
        'https://api.mercadopago.com/checkout/preferences',
        preferenceBody,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    const preference = response.data as {
      id: string;
      init_point: string;
      sandbox_init_point: string;
    };

    const tenantId = invoice.tenantAccount?.tenantId ?? '';

    const tx = this.txRepo.create({
      companyId,
      invoiceId: invoice.id,
      tenantId,
      status: PaymentGatewayTransactionStatus.PENDING,
      externalId: preference.id,
      amount: Number(invoice.total),
      currency: invoice.currencyCode ?? 'ARS',
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
      metadata: { preferenceId: preference.id },
    });

    const saved = await this.txRepo.save(tx);

    return {
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
      transactionId: saved.id,
    };
  }

  async processWebhook(notification: WebhookNotificationDto): Promise<void> {
    if (notification.type !== 'payment') {
      return;
    }

    const accessToken = this.configService.get<string>(
      'MERCADOPAGO_ACCESS_TOKEN',
    );
    if (!accessToken) {
      throw new InternalServerErrorException(
        'MercadoPago access token is not configured',
      );
    }

    const paymentResponse = await firstValueFrom(
      this.httpService.get(
        `https://api.mercadopago.com/v1/payments/${notification.data.id}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      ),
    );

    const payment = paymentResponse.data as {
      id: string | number;
      status: string;
      external_reference: string;
      payment_method_id?: string;
      installments?: number;
    };

    const invoiceId = payment.external_reference;

    const tx = await this.txRepo.findOne({
      where: { invoiceId, status: PaymentGatewayTransactionStatus.PENDING },
    });

    if (!tx) {
      return;
    }

    const statusMap: Record<string, PaymentGatewayTransactionStatus> = {
      approved: PaymentGatewayTransactionStatus.APPROVED,
      rejected: PaymentGatewayTransactionStatus.REJECTED,
      cancelled: PaymentGatewayTransactionStatus.CANCELLED,
      refunded: PaymentGatewayTransactionStatus.REFUNDED,
    };

    const newStatus =
      statusMap[payment.status] ?? PaymentGatewayTransactionStatus.PENDING;

    await this.txRepo.update(tx.id, {
      status: newStatus,
      externalPaymentId: String(payment.id),
      paymentMethod: payment.payment_method_id,
      installments: payment.installments ?? 1,
    });

    if (newStatus === PaymentGatewayTransactionStatus.APPROVED) {
      await this.dataSource.query(
        `UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2`,
        [InvoiceStatus.PAID, invoiceId],
      );
    }
  }

  async findAll(
    companyId: string,
    invoiceId?: string,
  ): Promise<PaymentGatewayTransaction[]> {
    const where: Record<string, string> = { companyId };
    if (invoiceId) {
      where.invoiceId = invoiceId;
    }
    return this.txRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(
    id: string,
    companyId: string,
  ): Promise<PaymentGatewayTransaction> {
    const tx = await this.txRepo.findOne({ where: { id, companyId } });
    if (!tx) {
      throw new NotFoundException(
        `Payment gateway transaction with ID ${id} not found`,
      );
    }
    return tx;
  }
}
