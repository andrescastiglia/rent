import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
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
import { Tenant } from '../tenants/entities/tenant.entity';
import { UserRole } from '../users/entities/user.entity';
import { CreatePaymentPreferenceDto } from './dto/create-payment-preference.dto';

interface MercadoPagoWebhookNotification {
  id: string;
  type: string;
  data: { id: string };
  action?: string;
  date_created?: string;
}

export interface MercadoPagoWebhookSignatureContext {
  xSignature?: string;
  xRequestId?: string;
  dataId?: string;
  receivedAt?: number;
}

interface UserContext {
  id: string;
  companyId: string;
  role: UserRole;
}

@Injectable()
export class PaymentGatewayService {
  constructor(
    @InjectRepository(PaymentGatewayTransaction)
    private readonly txRepo: Repository<PaymentGatewayTransaction>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async createPreference(
    companyId: string,
    userId: string,
    dto: CreatePaymentPreferenceDto,
    userRole?: UserRole,
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

    if (userRole === UserRole.TENANT && invoice.tenantAccount?.tenantId) {
      const tenant = await this.tenantRepo.findOne({
        where: { userId, companyId },
      });
      if (!tenant || tenant.id !== invoice.tenantAccount.tenantId) {
        throw new ForbiddenException('Invoice does not belong to your account');
      }
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

    const tenantId = invoice.tenantAccount?.tenantId ?? null;

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

  async processWebhook(
    payload: unknown,
    signatureContext: MercadoPagoWebhookSignatureContext = {},
  ): Promise<void> {
    const notification = this.normalizeWebhookNotification(payload);
    this.validateWebhookSignature(notification, signatureContext);

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
        `UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3`,
        [InvoiceStatus.PAID, invoiceId, tx.companyId],
      );
    }
  }

  private normalizeWebhookNotification(
    payload: unknown,
  ): MercadoPagoWebhookNotification {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid MercadoPago webhook payload');
    }

    const candidate = payload as Record<string, unknown>;
    const data = candidate.data;
    if (!data || typeof data !== 'object') {
      throw new BadRequestException('MercadoPago webhook data is required');
    }

    const dataId = (data as Record<string, unknown>).id;
    if (
      (typeof dataId !== 'string' && typeof dataId !== 'number') ||
      (typeof candidate.type !== 'string' &&
        typeof candidate.topic !== 'string')
    ) {
      throw new BadRequestException('Invalid MercadoPago webhook payload');
    }

    const rawNotificationId = candidate.id;
    const notificationId =
      typeof rawNotificationId === 'string' ||
      typeof rawNotificationId === 'number'
        ? String(rawNotificationId)
        : String(dataId);

    return {
      id: notificationId,
      type: String(candidate.type ?? candidate.topic),
      data: { id: String(dataId) },
      ...(typeof candidate.action === 'string'
        ? { action: candidate.action }
        : {}),
      ...(typeof candidate.date_created === 'string'
        ? { date_created: candidate.date_created }
        : {}),
    };
  }

  private validateWebhookSignature(
    notification: MercadoPagoWebhookNotification,
    context: MercadoPagoWebhookSignatureContext,
  ): void {
    const secret = this.configService.get<string>('MERCADOPAGO_WEBHOOK_SECRET');
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    if (!secret) {
      if (isProduction) {
        throw new InternalServerErrorException(
          'MercadoPago webhook secret is not configured',
        );
      }
      return;
    }

    const signedDataId = context.dataId ?? notification.data.id;
    if (
      context.dataId &&
      context.dataId.toLowerCase() !== notification.data.id.toLowerCase()
    ) {
      throw new UnauthorizedException('Invalid MercadoPago webhook signature');
    }

    const signatureParts = new Map(
      (context.xSignature ?? '').split(',').map((part) => {
        const separator = part.indexOf('=');
        if (separator < 1) return ['', ''];
        return [part.slice(0, separator).trim(), part.slice(separator + 1)];
      }),
    );
    const timestamp = signatureParts.get('ts');
    const providedDigest = signatureParts.get('v1');

    if (!timestamp || !providedDigest) {
      throw new UnauthorizedException('Invalid MercadoPago webhook signature');
    }

    const signatureTemplate = [
      `id:${signedDataId.toLowerCase()};`,
      context.xRequestId ? `request-id:${context.xRequestId};` : '',
      `ts:${timestamp};`,
    ].join('');
    const expectedDigest = createHmac('sha256', secret)
      .update(signatureTemplate)
      .digest('hex');
    const providedBuffer = Buffer.from(providedDigest, 'hex');
    const expectedBuffer = Buffer.from(expectedDigest, 'hex');

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid MercadoPago webhook signature');
    }

    const timestampValue = Number(timestamp);
    const timestampMs =
      timestampValue < 1_000_000_000_000
        ? timestampValue * 1000
        : timestampValue;
    const toleranceSeconds = Number(
      this.configService.get<string>('MERCADOPAGO_WEBHOOK_TOLERANCE_SECONDS') ??
        300,
    );
    const receivedAt = context.receivedAt ?? Date.now();

    if (
      !Number.isFinite(timestampMs) ||
      !Number.isFinite(toleranceSeconds) ||
      Math.abs(receivedAt - timestampMs) > toleranceSeconds * 1000
    ) {
      throw new UnauthorizedException('Expired MercadoPago webhook signature');
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
    user?: UserContext,
  ): Promise<PaymentGatewayTransaction> {
    const tx = await this.txRepo.findOne({ where: { id, companyId } });
    if (!tx) {
      throw new NotFoundException(
        `Payment gateway transaction with ID ${id} not found`,
      );
    }
    if (user?.role === UserRole.TENANT && tx.tenantId) {
      const tenant = await this.tenantRepo.findOne({
        where: { userId: user.id, companyId },
      });
      if (!tenant || tenant.id !== tx.tenantId) {
        throw new ForbiddenException(
          'Transaction does not belong to your account',
        );
      }
    }
    return tx;
  }
}
