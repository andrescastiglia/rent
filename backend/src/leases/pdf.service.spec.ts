import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PdfService } from './pdf.service';
import {
  Document,
  DocumentType,
  DocumentStatus,
} from '../documents/entities/document.entity';
import { Lease, LeaseStatus, PaymentFrequency } from './entities/lease.entity';

// Mock the S3 and template modules
jest.mock('@aws-sdk/client-s3');
jest.mock('./templates/contract-template', () => ({
  generateContractPdf: jest.fn(),
}));
jest.mock('../config/s3.config', () => ({
  getS3Config: jest.fn(() => ({ send: jest.fn() })),
  S3_BUCKET_NAME: 'test-bucket',
}));

import { generateContractPdf } from './templates/contract-template';

describe('PdfService', () => {
  let service: PdfService;
  let documentRepository: MockRepository<Document>;
  let configService: jest.Mocked<ConfigService>;

  type MockRepository<T extends Record<string, any> = any> = Partial<
    Record<keyof Repository<T>, jest.Mock>
  >;

  const createMockRepository = (): MockRepository => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  });

  const mockLease: Partial<Lease> = {
    id: 'lease-1',
    unitId: 'unit-1',
    tenantId: 'tenant-1',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31'),
    monthlyRent: 1500,
    status: LeaseStatus.ACTIVE,
    paymentFrequency: PaymentFrequency.MONTHLY,
  };

  const mockDocument: Partial<Document> = {
    id: 'doc-1',
    entityType: 'lease',
    entityId: 'lease-1',
    docType: DocumentType.CONTRACT,
    s3Key: 'leases/lease-1/contract-123.pdf',
    status: DocumentStatus.UPLOADED,
  };

  beforeEach(async () => {
    configService = {
      get: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfService,
        {
          provide: getRepositoryToken(Document),
          useValue: createMockRepository(),
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<PdfService>(PdfService);
    documentRepository = module.get(getRepositoryToken(Document));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateContract', () => {
    it('should generate and upload contract PDF', async () => {
      const mockPdfBuffer = Buffer.from('PDF content');
      (generateContractPdf as jest.Mock).mockResolvedValue(mockPdfBuffer);

      documentRepository.create!.mockReturnValue(mockDocument);
      documentRepository.save!.mockResolvedValue(mockDocument);

      // Mock S3 client send
      const mockS3Send = jest.fn().mockResolvedValue({});
      service['s3Client'] = { send: mockS3Send } as any;

      const result = await service.generateContract(
        mockLease as Lease,
        'user-1',
      );

      expect(generateContractPdf).toHaveBeenCalledWith(mockLease);
      expect(mockS3Send).toHaveBeenCalled();
      expect(documentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'lease',
          entityId: 'lease-1',
          docType: DocumentType.CONTRACT,
          uploadedBy: 'user-1',
        }),
      );
      expect(result).toEqual(mockDocument);
    });

    it('should create document with correct metadata', async () => {
      const mockPdfBuffer = Buffer.from('PDF content');
      (generateContractPdf as jest.Mock).mockResolvedValue(mockPdfBuffer);

      documentRepository.create!.mockReturnValue(mockDocument);
      documentRepository.save!.mockResolvedValue(mockDocument);

      const mockS3Send = jest.fn().mockResolvedValue({});
      service['s3Client'] = { send: mockS3Send } as any;

      await service.generateContract(mockLease as Lease, 'user-1');

      expect(documentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: 'application/pdf',
          fileSize: mockPdfBuffer.length,
          status: DocumentStatus.UPLOADED,
        }),
      );
    });
  });

  describe('getContractDocument', () => {
    it('should return contract document for lease', async () => {
      documentRepository.findOne!.mockResolvedValue(mockDocument);

      const result = await service.getContractDocument('lease-1');

      expect(documentRepository.findOne).toHaveBeenCalledWith({
        where: {
          entityType: 'lease',
          entityId: 'lease-1',
          docType: DocumentType.CONTRACT,
        },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(mockDocument);
    });

    it('should return null when no contract found', async () => {
      documentRepository.findOne!.mockResolvedValue(null);

      const result = await service.getContractDocument('lease-1');

      expect(result).toBeNull();
    });
  });
});
