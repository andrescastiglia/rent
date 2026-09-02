import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
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

interface MercadoPagoPayment {
  id: string | number;
  status: string;
  external_reference: string;
  transaction_amount?: number;
  currency_id?: string;
  payment_method_id?: string;
  installments?: number;
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
    const transactionId = randomUUID();

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
      external_reference: transactionId,
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
      id: transactionId,
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

    const eventKey = this.buildWebhookEventKey(notification);
    const claimed = await this.claimWebhookEvent(
      eventKey,
      notification,
      signatureContext,
    );
    if (!claimed) {
      return;
    }

    try {
      const payment = await this.fetchMercadoPagoPayment(notification.data.id);
      if (String(payment.id) !== notification.data.id) {
        throw new UnauthorizedException(
          'MercadoPago payment does not match the signed notification',
        );
      }

      const externalReference = payment.external_reference;
      let tx = await this.txRepo.findOne({
        where: { id: externalReference },
      });
      if (!tx) {
        tx = await this.txRepo.findOne({
          where: { invoiceId: externalReference },
        });
      }
      if (!tx) {
        await this.completeWebhookEvent(eventKey);
        return;
      }

      this.validatePaymentAgainstTransaction(payment, tx);
      const newStatus = this.mapPaymentStatus(payment.status);
      if (newStatus !== PaymentGatewayTransactionStatus.PENDING) {
        await this.applyPaymentTransition(tx, payment, newStatus);
      }
      await this.completeWebhookEvent(eventKey, tx.companyId);
    } catch (error) {
      await this.failWebhookEvent(eventKey, error);
      throw error;
    }
  }

  private async fetchMercadoPagoPayment(
    paymentId: string,
  ): Promise<MercadoPagoPayment> {
    const accessToken = this.configService.get<string>(
      'MERCADOPAGO_ACCESS_TOKEN',
    );
    if (!accessToken) {
      throw new InternalServerErrorException(
        'MercadoPago access token is not configured',
      );
    }
    const response = await firstValueFrom(
      this.httpService.get(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ),
    );
    const payment = response.data as Partial<MercadoPagoPayment>;
    if (
      (typeof payment.id !== 'string' && typeof payment.id !== 'number') ||
      typeof payment.status !== 'string' ||
      typeof payment.external_reference !== 'string' ||
      !payment.external_reference
    ) {
      throw new BadRequestException('Invalid MercadoPago payment response');
    }
    return payment as MercadoPagoPayment;
  }

  private mapPaymentStatus(status: string): PaymentGatewayTransactionStatus {
    const statusMap: Record<string, PaymentGatewayTransactionStatus> = {
      approved: PaymentGatewayTransactionStatus.APPROVED,
      rejected: PaymentGatewayTransactionStatus.REJECTED,
      cancelled: PaymentGatewayTransactionStatus.CANCELLED,
      refunded: PaymentGatewayTransactionStatus.REFUNDED,
    };
    return statusMap[status] ?? PaymentGatewayTransactionStatus.PENDING;
  }

  private validatePaymentAgainstTransaction(
    payment: MercadoPagoPayment,
    tx: PaymentGatewayTransaction,
  ): void {
    if (
      payment.transaction_amount === undefined ||
      Number(payment.transaction_amount) !== Number(tx.amount) ||
      payment.currency_id?.toUpperCase() !== tx.currency.toUpperCase()
    ) {
      throw new BadRequestException(
        'MercadoPago payment amount or currency does not match the transaction',
      );
    }
  }

  private async applyPaymentTransition(
    tx: PaymentGatewayTransaction,
    payment: MercadoPagoPayment,
    newStatus: PaymentGatewayTransactionStatus,
  ): Promise<void> {
    await this.dataSource.query(
      `WITH transitioned AS (
         UPDATE payment_gateway_transactions
         SET status = $1,
             external_payment_id = $2,
             payment_method = $3,
             installments = $4,
             updated_at = NOW()
         WHERE id = $5
           AND company_id = $6
           AND (
             (status = 'pending' AND $1 IN ('approved', 'rejected', 'cancelled'))
             OR (status = 'approved' AND $1 = 'refunded')
           )
         RETURNING invoice_id, company_id
       )
       UPDATE invoices
       SET status = $7, updated_at = NOW()
       WHERE id = $8
         AND company_id = $6
         AND $1 = 'approved'
         AND EXISTS (SELECT 1 FROM transitioned)`,
      [
        newStatus,
        String(payment.id),
        payment.payment_method_id ?? null,
        payment.installments ?? 1,
        tx.id,
        tx.companyId,
        InvoiceStatus.PAID,
        tx.invoiceId,
      ],
    );
  }

  private buildWebhookEventKey(
    notification: MercadoPagoWebhookNotification,
  ): string {
    return createHash('sha256')
      .update(
        [
          notification.id,
          notification.type,
          notification.data.id,
          notification.action ?? '',
          notification.date_created ?? '',
        ].join(':'),
      )
      .digest('hex');
  }

  private async claimWebhookEvent(
    eventKey: string,
    notification: MercadoPagoWebhookNotification,
    context: MercadoPagoWebhookSignatureContext,
  ): Promise<boolean> {
    if ((context.xRequestId?.length ?? 0) > 255) {
      throw new BadRequestException('MercadoPago request ID is too long');
    }
    const payloadSha256 = createHash('sha256')
      .update(JSON.stringify(notification))
      .digest('hex');
    const claimed = await this.dataSource.query(
      `INSERT INTO payment_gateway_webhook_events (
         provider, event_key, notification_id, data_id, request_id,
         payload_sha256, status, attempts, lease_expires_at
       ) VALUES ('mercadopago', $1, $2, $3, $4, $5, 'processing', 1,
                 NOW() + INTERVAL '5 minutes')
       ON CONFLICT (provider, event_key) DO UPDATE
       SET status = 'processing',
           attempts = payment_gateway_webhook_events.attempts + 1,
           request_id = EXCLUDED.request_id,
           lease_expires_at = NOW() + INTERVAL '5 minutes',
           last_error = NULL,
           updated_at = NOW()
       WHERE payment_gateway_webhook_events.status = 'failed'
          OR (
            payment_gateway_webhook_events.status = 'processing'
            AND payment_gateway_webhook_events.lease_expires_at < NOW()
          )
       RETURNING id`,
      [
        eventKey,
        notification.id,
        notification.data.id,
        context.xRequestId ?? null,
        payloadSha256,
      ],
    );
    if (Array.isArray(claimed) && claimed.length > 0) {
      return true;
    }

    const existing = await this.dataSource.query(
      `SELECT status FROM payment_gateway_webhook_events
       WHERE provider = 'mercadopago' AND event_key = $1`,
      [eventKey],
    );
    if (existing?.[0]?.status === 'processed') {
      return false;
    }
    throw new ServiceUnavailableException(
      'MercadoPago webhook is already being processed',
    );
  }

  private async completeWebhookEvent(
    eventKey: string,
    companyId?: string,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE payment_gateway_webhook_events
       SET status = 'processed', company_id = $2, processed_at = NOW(),
           lease_expires_at = NULL, updated_at = NOW()
       WHERE provider = 'mercadopago' AND event_key = $1`,
      [eventKey, companyId ?? null],
    );
  }

  private async failWebhookEvent(
    eventKey: string,
    error: unknown,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE payment_gateway_webhook_events
       SET status = 'failed', last_error = $2, lease_expires_at = NULL,
           updated_at = NOW()
       WHERE provider = 'mercadopago' AND event_key = $1`,
      [eventKey, error instanceof Error ? error.name : 'UnknownError'],
    );
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
    const notificationType = String(candidate.type ?? candidate.topic);
    if (
      notificationId.length > 255 ||
      String(dataId).length > 255 ||
      notificationType.length > 50
    ) {
      throw new BadRequestException('MercadoPago webhook fields are too long');
    }

    return {
      id: notificationId,
      type: notificationType,
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
