import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DigitalSignaturesService } from './digital-signatures.service';
import {
  DigitalSignatureRequest,
  SignatureProvider,
  SignatureStatus,
} from './entities/digital-signature-request.entity';
import { Lease, LeaseStatus } from '../leases/entities/lease.entity';
import { createHmac } from 'node:crypto';

type MockRepository<T extends Record<string, any> = any> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

const createMockRepository = (): MockRepository => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
});

const mockLease = (overrides: Partial<Lease> = {}): Lease =>
  ({
    id: 'lease-uuid-1',
    companyId: 'company-uuid-1',
    status: LeaseStatus.DRAFT,
    ...overrides,
  }) as Lease;

const mockRequest = (
  overrides: Partial<DigitalSignatureRequest> = {},
): DigitalSignatureRequest =>
  ({
    id: 'sig-uuid-1',
    companyId: 'company-uuid-1',
    leaseId: 'lease-uuid-1',
    provider: SignatureProvider.MOCK,
    externalEnvelopeId: 'env-123',
    status: SignatureStatus.SENT,
    tenantEmail: 'tenant@example.com',
    tenantName: 'John Tenant',
    ownerEmail: null,
    ownerName: null,
    signingUrl: 'https://sign.example.com/1',
    ownerSigningUrl: 'https://sign.example.com/owner/1',
    expiryDate: new Date(Date.now() + 30 * 86400000),
    sentAt: new Date(),
    completedAt: null,
    voidedAt: null,
    webhookEvents: [],
    certificateUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as DigitalSignatureRequest;

describe('DigitalSignaturesService', () => {
  let service: DigitalSignaturesService;
  let sigRequestRepo: MockRepository<DigitalSignatureRequest>;
  let leaseRepo: MockRepository<Lease>;
  let dataSource: { query: jest.Mock; transaction: jest.Mock };

  beforeEach(async () => {
    dataSource = { query: jest.fn(), transaction: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigitalSignaturesService,
        {
          provide: getRepositoryToken(DigitalSignatureRequest),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Lease),
          useValue: createMockRepository(),
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'NODE_ENV') return 'test';
              if (key === 'DOCUSIGN_WEBHOOK_SECRET') return 'signing-secret';
              if (key === 'SIGNATURE_WEBHOOK_TOLERANCE_SECONDS') return '300';
              return undefined;
            }),
          },
        },
        {
          provide: getDataSourceToken(),
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get(DigitalSignaturesService);
    sigRequestRepo = module.get(getRepositoryToken(DigitalSignatureRequest));
    leaseRepo = module.get(getRepositoryToken(Lease));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates a mock signature request only in test mode', async () => {
      const lease = mockLease();
      leaseRepo.findOne!.mockResolvedValue(lease);

      const savedRequest = mockRequest();
      sigRequestRepo.create!.mockReturnValue(savedRequest);
      sigRequestRepo.save!.mockResolvedValue(savedRequest);
      leaseRepo.save!.mockResolvedValue({
        ...lease,
        status: LeaseStatus.PENDING_SIGNATURE,
      });

      const dto = {
        leaseId: 'lease-uuid-1',
        tenantEmail: 'tenant@example.com',
        tenantName: 'John Tenant',
        provider: SignatureProvider.MOCK,
      };

      const result = await service.create('company-uuid-1', dto);

      expect(leaseRepo.findOne).toHaveBeenCalledWith({
        where: { id: dto.leaseId, companyId: 'company-uuid-1' },
      });
      expect(sigRequestRepo.save).toHaveBeenCalled();
      expect(leaseRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LeaseStatus.PENDING_SIGNATURE }),
      );
      expect(result).toEqual(savedRequest);
    });

    it('fails closed outside test until a real provider exists', async () => {
      const productionModule = await Test.createTestingModule({
        providers: [
          DigitalSignaturesService,
          {
            provide: getRepositoryToken(DigitalSignatureRequest),
            useValue: createMockRepository(),
          },
          {
            provide: getRepositoryToken(Lease),
            useValue: createMockRepository(),
          },
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue('production') },
          },
          {
            provide: getDataSourceToken(),
            useValue: { query: jest.fn(), transaction: jest.fn() },
          },
        ],
      }).compile();

      await expect(
        productionModule
          .get(DigitalSignaturesService)
          .create('company-uuid-1', {
            leaseId: 'lease-uuid-1',
            tenantEmail: 'a@b.com',
            tenantName: 'A',
          }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('throws NotFoundException when lease not found', async () => {
      leaseRepo.findOne!.mockResolvedValue(null);

      await expect(
        service.create('company-uuid-1', {
          leaseId: 'missing',
          tenantEmail: 'a@b.com',
          tenantName: 'A',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when lease is not DRAFT', async () => {
      leaseRepo.findOne!.mockResolvedValue(
        mockLease({ status: LeaseStatus.ACTIVE }),
      );

      await expect(
        service.create('company-uuid-1', {
          leaseId: 'lease-uuid-1',
          tenantEmail: 'a@b.com',
          tenantName: 'A',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('returns all requests for a company', async () => {
      const requests = [mockRequest()];
      sigRequestRepo.find!.mockResolvedValue(requests);

      const result = await service.findAll('company-uuid-1');

      expect(sigRequestRepo.find).toHaveBeenCalledWith({
        where: { companyId: 'company-uuid-1' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(requests);
    });

    it('filters by leaseId when provided', async () => {
      sigRequestRepo.find!.mockResolvedValue([]);

      await service.findAll('company-uuid-1', 'lease-uuid-1');

      expect(sigRequestRepo.find).toHaveBeenCalledWith({
        where: { companyId: 'company-uuid-1', leaseId: 'lease-uuid-1' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('returns the request when found', async () => {
      const request = mockRequest();
      sigRequestRepo.findOne!.mockResolvedValue(request);

      const result = await service.findOne('sig-uuid-1', 'company-uuid-1');

      expect(result).toEqual(request);
    });

    it('throws NotFoundException when not found', async () => {
      sigRequestRepo.findOne!.mockResolvedValue(null);

      await expect(
        service.findOne('missing', 'company-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('processWebhook', () => {
    it('completes request and leaves lease signed for explicit activation', async () => {
      const request = mockRequest({ provider: SignatureProvider.MOCK });
      const lease = mockLease({ status: LeaseStatus.PENDING_SIGNATURE });

      sigRequestRepo.findOne!.mockResolvedValue(request);
      sigRequestRepo.save!.mockResolvedValue({
        ...request,
        status: SignatureStatus.COMPLETED,
      });
      leaseRepo.findOne!.mockResolvedValue(lease);
      const capturedStatuses: string[] = [];
      leaseRepo.save!.mockImplementation((l) => {
        capturedStatuses.push((l as Lease).status);
        return Promise.resolve({ ...l } as Lease);
      });

      await service.processWebhook({
        envelopeId: 'env-123',
        status: 'completed',
        generatedAt: new Date().toISOString(),
        signerEmail: 'tenant@example.com',
        completedAt: new Date().toISOString(),
      });

      expect(sigRequestRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: SignatureStatus.COMPLETED }),
      );
      expect(leaseRepo.save).toHaveBeenCalledTimes(1);
      expect(capturedStatuses[0]).toBe(LeaseStatus.SIGNED);
    });

    it('voids request and reverts lease to DRAFT', async () => {
      const request = mockRequest();
      const lease = mockLease({ status: LeaseStatus.PENDING_SIGNATURE });

      sigRequestRepo.findOne!.mockResolvedValue(request);
      sigRequestRepo.save!.mockResolvedValue({
        ...request,
        status: SignatureStatus.VOIDED,
      });
      leaseRepo.findOne!.mockResolvedValue(lease);
      leaseRepo.save!.mockImplementation((l) => Promise.resolve(l as Lease));

      await service.processWebhook({
        envelopeId: 'env-123',
        status: 'voided',
        generatedAt: new Date().toISOString(),
        signerEmail: 'tenant@example.com',
      });

      expect(sigRequestRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: SignatureStatus.VOIDED }),
      );
      expect(leaseRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LeaseStatus.DRAFT }),
      );
    });

    it('declines request and reverts lease to DRAFT', async () => {
      const request = mockRequest();
      const lease = mockLease({ status: LeaseStatus.PENDING_SIGNATURE });

      sigRequestRepo.findOne!.mockResolvedValue(request);
      sigRequestRepo.save!.mockResolvedValue({
        ...request,
        status: SignatureStatus.DECLINED,
      });
      leaseRepo.findOne!.mockResolvedValue(lease);
      leaseRepo.save!.mockImplementation((l) => Promise.resolve(l as Lease));

      await service.processWebhook({
        envelopeId: 'env-123',
        status: 'declined',
        generatedAt: new Date().toISOString(),
        signerEmail: 'tenant@example.com',
      });

      expect(sigRequestRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: SignatureStatus.DECLINED }),
      );
      expect(leaseRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LeaseStatus.DRAFT }),
      );
    });

    it('does nothing when envelope not found', async () => {
      sigRequestRepo.findOne!.mockResolvedValue(null);

      await service.processWebhook({
        envelopeId: 'unknown',
        status: 'completed',
        generatedAt: new Date().toISOString(),
        signerEmail: 'a@b.com',
      });

      expect(sigRequestRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('acceptWebhook', () => {
    const createEvent = () => ({
      eventId: 'event-1',
      envelopeId: 'env-123',
      status: 'completed',
      generatedAt: new Date().toISOString(),
    });

    it('authenticates, persists and applies a company-scoped event', async () => {
      const event = createEvent();
      const rawBody = Buffer.from(JSON.stringify(event));
      const signature = createHmac('sha256', 'signing-secret')
        .update(rawBody)
        .digest('base64');
      const manager = { query: jest.fn() };
      dataSource.query.mockResolvedValueOnce([{ id: 'inbox-1' }]);
      manager.query
        .mockResolvedValueOnce([{ id: 'inbox-1' }])
        .mockResolvedValueOnce([
          {
            id: 'sig-1',
            company_id: 'company-1',
            lease_id: 'lease-1',
            status: SignatureStatus.SENT,
          },
        ])
        .mockResolvedValue([]);
      dataSource.transaction.mockImplementation(async (callback) =>
        callback(manager),
      );

      await expect(
        service.acceptWebhook('docusign', event, rawBody, { signature }),
      ).resolves.toEqual({ received: true, duplicate: false });
      expect(manager.query.mock.calls[2][1]).toEqual(
        expect.arrayContaining(['company-1']),
      );
      expect(manager.query.mock.calls[3][1]).toEqual([
        'lease-1',
        'company-1',
        LeaseStatus.SIGNED,
      ]);
    });

    it('rejects invalid signatures before persistence', async () => {
      const event = createEvent();
      const rawBody = Buffer.from(JSON.stringify(event));

      await expect(
        service.acceptWebhook('docusign', event, rawBody, {
          signature: 'invalid',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('rejects replayed events outside the timestamp tolerance', async () => {
      const event = {
        ...createEvent(),
        generatedAt: new Date(Date.now() - 600_000).toISOString(),
      };
      const rawBody = Buffer.from(JSON.stringify(event));
      const signature = createHmac('sha256', 'signing-secret')
        .update(rawBody)
        .digest('base64');

      await expect(
        service.acceptWebhook('docusign', event, rawBody, { signature }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });

  describe('void', () => {
    it('voids a sent request and reverts lease to DRAFT', async () => {
      const request = mockRequest({ status: SignatureStatus.SENT });
      const lease = mockLease({ status: LeaseStatus.PENDING_SIGNATURE });

      sigRequestRepo.findOne!.mockResolvedValue(request);
      const voidedRequest = { ...request, status: SignatureStatus.VOIDED };
      sigRequestRepo.save!.mockResolvedValue(voidedRequest);
      leaseRepo.findOne!.mockResolvedValue(lease);
      leaseRepo.save!.mockImplementation((l) => Promise.resolve(l as Lease));

      const result = await service.void('sig-uuid-1', 'company-uuid-1');

      expect(result.status).toBe(SignatureStatus.VOIDED);
      expect(leaseRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: LeaseStatus.DRAFT }),
      );
    });

    it('throws BadRequestException when request is already completed', async () => {
      sigRequestRepo.findOne!.mockResolvedValue(
        mockRequest({ status: SignatureStatus.COMPLETED }),
      );

      await expect(
        service.void('sig-uuid-1', 'company-uuid-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when request not found', async () => {
      sigRequestRepo.findOne!.mockResolvedValue(null);

      await expect(service.void('missing', 'company-uuid-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
