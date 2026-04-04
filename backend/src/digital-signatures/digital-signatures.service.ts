import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  DigitalSignatureRequest,
  SignatureProvider,
  SignatureStatus,
} from './entities/digital-signature-request.entity';
import { Lease, LeaseStatus } from '../leases/entities/lease.entity';
import { CreateSignatureRequestDto } from './dto/create-signature-request.dto';
import { WebhookEventDto } from './dto/webhook-event.dto';

interface ProviderResult {
  envelopeId: string;
  signingUrl: string;
  ownerSigningUrl: string;
  expiryDate: Date;
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
  static getAdapter(_provider: string): MockAdapter {
    // All non-mock providers fall back to mock in development
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
  ) {}

  async create(
    companyId: string,
    dto: CreateSignatureRequestDto,
  ): Promise<DigitalSignatureRequest> {
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

    lease.status = LeaseStatus.PENDING_SIGNATURE;
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
        lease.status = LeaseStatus.SIGNED;
        await this.leaseRepo.save(lease);

        if (request.provider === SignatureProvider.MOCK) {
          lease.status = LeaseStatus.ACTIVE;
          await this.leaseRepo.save(lease);
        }
      }
    } else if (event.status === 'voided' || event.status === 'declined') {
      request.status =
        event.status === 'voided'
          ? SignatureStatus.VOIDED
          : SignatureStatus.DECLINED;
      request.voidedAt = new Date();

      await this.sigRequestRepo.save(request);

      const lease = await this.leaseRepo.findOne({
        where: { id: request.leaseId },
      });

      if (lease) {
        lease.status = LeaseStatus.DRAFT;
        await this.leaseRepo.save(lease);
      }
    } else {
      await this.sigRequestRepo.save(request);
    }
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
      lease.status = LeaseStatus.DRAFT;
      await this.leaseRepo.save(lease);
    }

    return saved;
  }
}
