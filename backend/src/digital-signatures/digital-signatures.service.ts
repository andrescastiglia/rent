import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  DigitalSignatureRequest,
  SignatureProvider,
  SignatureStatus,
} from './entities/digital-signature-request.entity';
import {
  ContractSignatureStatus,
  Lease,
  LeaseStatus,
} from '../leases/entities/lease.entity';
import { CreateSignatureRequestDto } from './dto/create-signature-request.dto';
import { WebhookEventDto } from './dto/webhook-event.dto';

interface ProviderResult {
  envelopeId: string;
  signingUrl: string;
  ownerSigningUrl: string;
  expiryDate: Date;
}

export interface SignatureWebhookContext {
  signature?: string;
  receivedAt?: number;
}

class MockAdapter {
  send(
    _pdfBytes: Buffer,
    _tenantEmail: string,
    _tenantName: string,
    expiryDays: number,
  ): ProviderResult {
    const now = Date.now();
    return {
      envelopeId: `env-${now}`,
      signingUrl: `https://sign.example.com/${now}`,
      ownerSigningUrl: `https://sign.example.com/owner/${now}`,
      expiryDate: new Date(now + expiryDays * 86400000),
    };
  }
}

class ProviderAdapterFactory {
  static getAdapter(provider: SignatureProvider): MockAdapter {
    if (provider !== SignatureProvider.MOCK) {
      throw new ServiceUnavailableException(
        `Signature provider ${provider} is not configured`,
      );
    }
    return new MockAdapter();
  }
}

@Injectable()
export class DigitalSignaturesService {
  constructor(
    @InjectRepository(DigitalSignatureRequest)
    private readonly sigRequestRepo: Repository<DigitalSignatureRequest>,
    @InjectRepository(Lease)
    private readonly leaseRepo: Repository<Lease>,
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(
    companyId: string,
    dto: CreateSignatureRequestDto,
  ): Promise<DigitalSignatureRequest> {
    if (this.configService.get<string>('NODE_ENV') !== 'test') {
      throw new ServiceUnavailableException(
        'Digital signatures are disabled until a real provider is configured',
      );
    }

    const lease = await this.leaseRepo.findOne({
      where: { id: dto.leaseId, companyId },
    });

    if (!lease) {
      throw new NotFoundException(`Lease with ID ${dto.leaseId} not found`);
    }

    if (lease.status !== LeaseStatus.DRAFT) {
      throw new BadRequestException(
        `Lease must be in DRAFT status to initiate signing (current: ${lease.status})`,
      );
    }

    const pdfBytes = Buffer.from('mock-pdf');

    const expiryDays = dto.expiryDays ?? 30;
    const provider =
      dto.provider ??
      (this.configService.get<string>('NODE_ENV') === 'production'
        ? SignatureProvider.DOCUSIGN
        : SignatureProvider.MOCK);

    const adapter = ProviderAdapterFactory.getAdapter(provider);
    const result = adapter.send(
      pdfBytes,
      dto.tenantEmail,
      dto.tenantName,
      expiryDays,
    );

    const request = this.sigRequestRepo.create({
      companyId,
      leaseId: dto.leaseId,
      provider,
      externalEnvelopeId: result.envelopeId,
      status: SignatureStatus.SENT,
      tenantEmail: dto.tenantEmail,
      tenantName: dto.tenantName,
      ownerEmail: dto.ownerEmail ?? null,
      ownerName: dto.ownerName ?? null,
      signingUrl: result.signingUrl,
      ownerSigningUrl: result.ownerSigningUrl,
      expiryDate: result.expiryDate,
      sentAt: new Date(),
      webhookEvents: [],
    });

    const saved = await this.sigRequestRepo.save(request);

    lease.signatureStatus = ContractSignatureStatus.PENDING;
    await this.leaseRepo.save(lease);

    return saved;
  }

  async findAll(
    companyId: string,
    leaseId?: string,
  ): Promise<DigitalSignatureRequest[]> {
    const where: Record<string, string> = { companyId };
    if (leaseId) {
      where.leaseId = leaseId;
    }
    return this.sigRequestRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(
    id: string,
    companyId: string,
  ): Promise<DigitalSignatureRequest> {
    const request = await this.sigRequestRepo.findOne({
      where: { id, companyId },
    });

    if (!request) {
      throw new NotFoundException(`Signature request with ID ${id} not found`);
    }

    return request;
  }

  async processWebhook(event: WebhookEventDto): Promise<void> {
    if (this.configService.get<string>('NODE_ENV') !== 'test') {
      throw new ServiceUnavailableException(
        'Digital signature webhooks are disabled until provider verification is configured',
      );
    }

    const request = await this.sigRequestRepo.findOne({
      where: { externalEnvelopeId: event.envelopeId },
    });

    if (!request) {
      return;
    }

    const webhookEvents = [...(request.webhookEvents as object[]), event];
    request.webhookEvents = webhookEvents;

    if (event.status === 'completed') {
      request.status = SignatureStatus.COMPLETED;
      request.completedAt = event.completedAt
        ? new Date(event.completedAt)
        : new Date();

      await this.sigRequestRepo.save(request);

      const lease = await this.leaseRepo.findOne({
        where: { id: request.leaseId },
      });

      if (lease) {
        lease.signatureStatus = ContractSignatureStatus.SIGNED;
        await this.leaseRepo.save(lease);
      }
    } else if (
      event.status === 'voided' ||
      event.status === 'declined' ||
      event.status === 'expired'
    ) {
      request.status =
        event.status === 'voided'
          ? SignatureStatus.VOIDED
          : event.status === 'declined'
            ? SignatureStatus.DECLINED
            : SignatureStatus.EXPIRED;
      request.voidedAt = new Date();

      await this.sigRequestRepo.save(request);

      const lease = await this.leaseRepo.findOne({
        where: { id: request.leaseId },
      });

      if (lease) {
        lease.signatureStatus =
          event.status === 'voided'
            ? ContractSignatureStatus.VOIDED
            : event.status === 'declined'
              ? ContractSignatureStatus.DECLINED
              : ContractSignatureStatus.EXPIRED;
        await this.leaseRepo.save(lease);
      }
    } else {
      await this.sigRequestRepo.save(request);
    }
  }

  async acceptWebhook(
    provider: string,
    event: WebhookEventDto,
    rawBody: Buffer | undefined,
    context: SignatureWebhookContext,
  ): Promise<{ received: true; duplicate: boolean }> {
    if (provider !== SignatureProvider.DOCUSIGN) {
      throw new BadRequestException('Unsupported signature webhook provider');
    }
    if (!rawBody) {
      throw new BadRequestException('Raw signature webhook body is required');
    }
    this.validateWebhookSignature(provider, event, rawBody, context);

    const payloadSha256 = createHash('sha256').update(rawBody).digest('hex');
    const eventIdentity = event.eventId
      ? `event-id:${event.eventId}`
      : `payload:${event.envelopeId}:${payloadSha256}`;
    const eventKey = createHash('sha256').update(eventIdentity).digest('hex');
    const inserted = await this.dataSource.query(
      `INSERT INTO signature_webhook_inbox (
         provider, event_key, external_envelope_id, payload_sha256, payload,
         status, attempts, lease_expires_at
       ) VALUES ($1, $2, $3, $4, $5::jsonb, 'processing', 1,
                 NOW() + INTERVAL '5 minutes')
       ON CONFLICT (provider, event_key) DO NOTHING
       RETURNING id`,
      [
        provider,
        eventKey,
        event.envelopeId,
        payloadSha256,
        JSON.stringify(event),
      ],
    );

    if (!inserted[0]) {
      const existing = await this.dataSource.query(
        `SELECT id, payload_sha256, status FROM signature_webhook_inbox
          WHERE provider = $1 AND event_key = $2`,
        [provider, eventKey],
      );
      if (existing[0]?.payload_sha256 !== payloadSha256) {
        throw new ConflictException('Signature webhook event ID was reused');
      }
      const reclaimed = await this.dataSource.query(
        `UPDATE signature_webhook_inbox
            SET status = 'processing', attempts = attempts + 1,
                lease_expires_at = NOW() + INTERVAL '5 minutes',
                last_error = NULL, updated_at = NOW()
          WHERE id = $1::uuid
            AND (status IN ('queued', 'failed')
              OR (status = 'processing' AND lease_expires_at < NOW()))
          RETURNING id`,
        [existing[0].id],
      );
      if (!reclaimed[0]) return { received: true, duplicate: true };
      try {
        await this.applyPersistedWebhook(
          String(reclaimed[0].id),
          provider,
          event,
        );
        return { received: true, duplicate: false };
      } catch (error) {
        await this.markWebhookFailed(String(reclaimed[0].id), error);
        throw error;
      }
    }

    const inboxId = String(inserted[0].id);
    try {
      await this.applyPersistedWebhook(inboxId, provider, event);
      return { received: true, duplicate: false };
    } catch (error) {
      await this.markWebhookFailed(inboxId, error);
      throw error;
    }
  }

  private async markWebhookFailed(
    inboxId: string,
    error: unknown,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE signature_webhook_inbox
          SET status = 'failed', lease_expires_at = NULL, last_error = $2,
              updated_at = NOW()
        WHERE id = $1::uuid`,
      [inboxId, error instanceof Error ? error.name : 'UnknownError'],
    );
  }

  private validateWebhookSignature(
    provider: string,
    event: WebhookEventDto,
    rawBody: Buffer,
    context: SignatureWebhookContext,
  ): void {
    const secret = this.configService.get<string>(
      `${provider.toUpperCase()}_WEBHOOK_SECRET`,
    );
    if (!secret) {
      throw new ServiceUnavailableException(
        'Signature webhook secret is not configured',
      );
    }
    const provided = context.signature?.trim() ?? '';
    const expected = createHmac('sha256', secret).update(rawBody).digest();
    let providedBuffer: Buffer;
    try {
      providedBuffer = Buffer.from(provided, 'base64');
    } catch {
      throw new UnauthorizedException('Invalid signature webhook signature');
    }
    if (
      providedBuffer.length !== expected.length ||
      !timingSafeEqual(providedBuffer, expected)
    ) {
      throw new UnauthorizedException('Invalid signature webhook signature');
    }

    const generatedAt = Date.parse(event.generatedAt);
    const toleranceSeconds = Number(
      this.configService.get<string>('SIGNATURE_WEBHOOK_TOLERANCE_SECONDS') ??
        300,
    );
    const receivedAt = context.receivedAt ?? Date.now();
    if (
      !Number.isFinite(generatedAt) ||
      !Number.isFinite(toleranceSeconds) ||
      toleranceSeconds <= 0 ||
      Math.abs(receivedAt - generatedAt) > toleranceSeconds * 1000
    ) {
      throw new UnauthorizedException('Expired signature webhook');
    }
  }

  private async applyPersistedWebhook(
    inboxId: string,
    provider: string,
    event: WebhookEventDto,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const inbox = await manager.query(
        `SELECT id FROM signature_webhook_inbox
          WHERE id = $1::uuid AND status = 'processing'
          FOR UPDATE`,
        [inboxId],
      );
      if (!inbox[0]) return;

      const requests = await manager.query(
        `SELECT * FROM digital_signature_requests
          WHERE provider = $1 AND external_envelope_id = $2
          FOR UPDATE`,
        [provider, event.envelopeId],
      );
      const request = requests[0] as
        | { id: string; company_id: string; lease_id: string; status: string }
        | undefined;
      if (!request) {
        throw new NotFoundException('Signature envelope not found');
      }

      const targetStatus = event.status as SignatureStatus;
      const terminal = new Set<string>([
        SignatureStatus.COMPLETED,
        SignatureStatus.VOIDED,
        SignatureStatus.DECLINED,
        SignatureStatus.EXPIRED,
      ]);
      if (terminal.has(request.status) && request.status !== targetStatus) {
        throw new ConflictException(
          `Invalid signature transition ${request.status} -> ${targetStatus}`,
        );
      }
      if (
        !terminal.has(request.status) &&
        request.status !== SignatureStatus.SENT &&
        request.status !== SignatureStatus.PENDING
      ) {
        throw new ConflictException(
          `Invalid signature transition ${request.status} -> ${targetStatus}`,
        );
      }

      await manager.query(
        `UPDATE digital_signature_requests
            SET status = $2,
                completed_at = CASE WHEN $2 = 'completed'
                  THEN COALESCE($3::timestamptz, NOW()) ELSE completed_at END,
                voided_at = CASE WHEN $2 IN ('voided', 'declined')
                  THEN COALESCE(voided_at, NOW()) ELSE voided_at END,
                webhook_events = COALESCE(webhook_events, '[]'::jsonb)
                  || jsonb_build_array($4::jsonb),
                updated_at = NOW()
          WHERE id = $1::uuid AND company_id = $5::uuid`,
        [
          request.id,
          targetStatus,
          event.completedAt ?? null,
          JSON.stringify({
            eventId: event.eventId ?? null,
            status: targetStatus,
            generatedAt: event.generatedAt,
          }),
          request.company_id,
        ],
      );

      const signatureStatus =
        targetStatus === SignatureStatus.COMPLETED
          ? ContractSignatureStatus.SIGNED
          : targetStatus === SignatureStatus.DECLINED
            ? ContractSignatureStatus.DECLINED
            : targetStatus === SignatureStatus.EXPIRED
              ? ContractSignatureStatus.EXPIRED
              : ContractSignatureStatus.VOIDED;
      await manager.query(
        `UPDATE leases SET signature_status = $3, updated_at = NOW()
          WHERE id = $1::uuid AND company_id = $2::uuid
            AND signature_status = 'pending'`,
        [request.lease_id, request.company_id, signatureStatus],
      );
      await manager.query(
        `UPDATE signature_webhook_inbox
            SET status = 'processed', company_id = $2::uuid,
                processed_at = NOW(), lease_expires_at = NULL,
                last_error = NULL, updated_at = NOW()
          WHERE id = $1::uuid`,
        [inboxId, request.company_id],
      );
    });
  }

  async void(id: string, companyId: string): Promise<DigitalSignatureRequest> {
    const request = await this.findOne(id, companyId);

    if (
      request.status !== SignatureStatus.PENDING &&
      request.status !== SignatureStatus.SENT
    ) {
      throw new BadRequestException(
        `Cannot void a request with status ${request.status}`,
      );
    }

    request.status = SignatureStatus.VOIDED;
    request.voidedAt = new Date();

    const saved = await this.sigRequestRepo.save(request);

    const lease = await this.leaseRepo.findOne({
      where: { id: request.leaseId },
    });

    if (lease) {
      lease.signatureStatus = ContractSignatureStatus.VOIDED;
      await this.leaseRepo.save(lease);
    }

    return saved;
  }
}
