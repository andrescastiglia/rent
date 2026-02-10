import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { I18nService } from 'nestjs-i18n';
import { PdfService } from './pdf.service';
import {
  Document,
  DocumentStatus,
  DocumentType,
} from '../documents/entities/document.entity';
import { Lease } from './entities/lease.entity';

jest.mock('./templates/contract-template', () => ({
  generateContractPdf: jest.fn(),
}));

import { generateContractPdf } from './templates/contract-template';

type MockRepository<T extends Record<string, any> = any> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

const createMockRepository = (): MockRepository => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
});

describe('PdfService', () => {
  let service: PdfService;
  let documentsRepository: MockRepository<Document>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfService,
        {
          provide: getRepositoryToken(Document),
          useValue: createMockRepository(),
        },
        {
          provide: I18nService,
          useValue: {
            t: jest.fn((key: string) => key),
          },
        },
      ],
    }).compile();

    service = module.get(PdfService);
    documentsRepository = module.get(getRepositoryToken(Document));
  });

  it('stores contract PDF in DB and sets db:// URL', async () => {
    const lease = {
      id: 'lease-1',
      companyId: 'company-1',
      tenant: { user: { language: 'es' } },
    } as unknown as Lease;
    const pdfBuffer = Buffer.from('fake-pdf');
    (generateContractPdf as jest.Mock).mockResolvedValue(pdfBuffer);

    documentsRepository.create!.mockImplementation((d) => d as any);
    documentsRepository
      .save!.mockResolvedValueOnce({
        id: 'doc-1',
        fileUrl: 'db://document/pending',
      } as any)
      .mockResolvedValueOnce({
        id: 'doc-1',
        fileUrl: 'db://document/doc-1',
        documentType: DocumentType.LEASE_CONTRACT,
        status: DocumentStatus.APPROVED,
      } as any);

    const result = await service.generateContract(lease, 'user-1');

    expect(generateContractPdf).toHaveBeenCalled();
    expect(documentsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        entityType: 'lease',
        entityId: 'lease-1',
        documentType: DocumentType.LEASE_CONTRACT,
        fileData: pdfBuffer,
        status: DocumentStatus.APPROVED,
      }),
    );
    expect(result.fileUrl).toBe('db://document/doc-1');
  });

  it('returns latest contract document by lease id', async () => {
    documentsRepository.findOne!.mockResolvedValue({ id: 'doc-1' } as any);
    await service.getContractDocument('lease-1');
    expect(documentsRepository.findOne).toHaveBeenCalledWith({
      where: {
        entityType: 'lease',
        entityId: 'lease-1',
        documentType: DocumentType.LEASE_CONTRACT,
      },
      order: { createdAt: 'DESC' },
    });
  });
});
