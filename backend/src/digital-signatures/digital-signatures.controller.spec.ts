import { Test, TestingModule } from '@nestjs/testing';
import { DigitalSignaturesController } from './digital-signatures.controller';
import { DigitalSignaturesService } from './digital-signatures.service';
import {
  DigitalSignatureRequest,
  SignatureProvider,
  SignatureStatus,
} from './entities/digital-signature-request.entity';
import { UserRole } from '../users/entities/user.entity';

const mockService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  void: jest.fn(),
  processWebhook: jest.fn(),
};

const mockRequest = {
  user: {
    id: 'user-uuid-1',
    email: 'admin@example.com',
    companyId: 'company-uuid-1',
    role: UserRole.ADMIN,
  },
};

const mockSigRequest: Partial<DigitalSignatureRequest> = {
  id: 'sig-uuid-1',
  companyId: 'company-uuid-1',
  leaseId: 'lease-uuid-1',
  provider: SignatureProvider.MOCK,
  status: SignatureStatus.SENT,
};

describe('DigitalSignaturesController', () => {
  let controller: DigitalSignaturesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DigitalSignaturesController],
      providers: [{ provide: DigitalSignaturesService, useValue: mockService }],
    }).compile();

    controller = module.get(DigitalSignaturesController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('delegates to service with companyId', async () => {
      mockService.findAll.mockResolvedValue([mockSigRequest]);

      const result = await controller.findAll(mockRequest as any, undefined);

      expect(mockService.findAll).toHaveBeenCalledWith(
        'company-uuid-1',
        undefined,
      );
      expect(result).toEqual([mockSigRequest]);
    });

    it('passes leaseId filter', async () => {
      mockService.findAll.mockResolvedValue([mockSigRequest]);

      await controller.findAll(mockRequest as any, 'lease-uuid-1');

      expect(mockService.findAll).toHaveBeenCalledWith(
        'company-uuid-1',
        'lease-uuid-1',
      );
    });
  });

  describe('findOne', () => {
    it('delegates to service with id and companyId', async () => {
      mockService.findOne.mockResolvedValue(mockSigRequest);

      const result = await controller.findOne('sig-uuid-1', mockRequest as any);

      expect(mockService.findOne).toHaveBeenCalledWith(
        'sig-uuid-1',
        'company-uuid-1',
      );
      expect(result).toEqual(mockSigRequest);
    });
  });

  describe('create', () => {
    it('delegates to service with dto and companyId', async () => {
      const dto = {
        leaseId: 'lease-uuid-1',
        tenantEmail: 'tenant@example.com',
        tenantName: 'John Tenant',
      } as any;
      mockService.create.mockResolvedValue(mockSigRequest);

      const result = await controller.create(dto, mockRequest as any);

      expect(mockService.create).toHaveBeenCalledWith('company-uuid-1', dto);
      expect(result).toEqual(mockSigRequest);
    });
  });

  describe('void', () => {
    it('delegates to service with id and companyId', async () => {
      const voided = { ...mockSigRequest, status: SignatureStatus.VOIDED };
      mockService.void.mockResolvedValue(voided);

      const result = await controller.void('sig-uuid-1', mockRequest as any);

      expect(mockService.void).toHaveBeenCalledWith(
        'sig-uuid-1',
        'company-uuid-1',
      );
      expect(result).toEqual(voided);
    });
  });

  describe('processWebhook', () => {
    it('delegates to service', async () => {
      mockService.processWebhook.mockResolvedValue(undefined);

      const dto = {
        envelopeId: 'env-123',
        status: 'completed',
        signerEmail: 'tenant@example.com',
      };

      await controller.processWebhook(dto as any);

      expect(mockService.processWebhook).toHaveBeenCalledWith(dto);
    });
  });
});
