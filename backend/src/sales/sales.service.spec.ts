import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesService } from './sales.service';
import { SaleFolder } from './entities/sale-folder.entity';
import { SaleAgreement } from './entities/sale-agreement.entity';
import { SaleReceipt } from './entities/sale-receipt.entity';
import { SaleReceiptPdfService } from './sale-receipt-pdf.service';

describe('SalesService', () => {
  let service: SalesService;
  let foldersRepository: MockRepository<SaleFolder>;
  let agreementsRepository: MockRepository<SaleAgreement>;
  let receiptsRepository: MockRepository<SaleReceipt>;
  let receiptPdfService: Partial<SaleReceiptPdfService>;

  type MockRepository<T extends Record<string, any> = any> = Partial<
    Record<keyof Repository<T>, jest.Mock>
  >;

  const createMockRepository = (): MockRepository => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
  });

  beforeEach(async () => {
    receiptPdfService = {
      generate: jest.fn().mockResolvedValue('s3://receipt.pdf'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: getRepositoryToken(SaleFolder), useValue: createMockRepository() },
        { provide: getRepositoryToken(SaleAgreement), useValue: createMockRepository() },
        { provide: getRepositoryToken(SaleReceipt), useValue: createMockRepository() },
        { provide: SaleReceiptPdfService, useValue: receiptPdfService },
      ],
    }).compile();

    service = module.get(SalesService);
    foldersRepository = module.get(getRepositoryToken(SaleFolder));
    agreementsRepository = module.get(getRepositoryToken(SaleAgreement));
    receiptsRepository = module.get(getRepositoryToken(SaleReceipt));
  });

  it('should create sale receipt with duplicate copy and pdf', async () => {
    const agreement = {
      id: 'agr-1',
      companyId: 'company-1',
      folderId: 'folder-1',
      buyerName: 'Ana',
      buyerPhone: '123',
      totalAmount: 1000,
      currency: 'ARS',
      installmentAmount: 100,
      installmentCount: 10,
      startDate: '2024-01-01',
      dueDay: 10,
      paidAmount: 200,
    } as unknown as SaleAgreement;

    agreementsRepository.findOne!.mockResolvedValue(agreement);
    receiptsRepository.count!.mockResolvedValue(2);
    agreementsRepository.save!.mockResolvedValue(agreement);
    receiptsRepository.create!.mockImplementation((data) => ({ id: 'rec-1', ...data }));
    receiptsRepository.save!.mockImplementation(async (data) => data);

    const receipt = await service.createReceipt(
      'agr-1',
      {
        amount: 100,
        paymentDate: '2024-04-15',
      },
      { companyId: 'company-1' },
    );

    expect(receipt.copyCount).toBe(2);
    expect(receipt.pdfUrl).toBe('s3://receipt.pdf');
    expect(receipt.overdueAmount).toBe(200);
    expect(receipt.balanceAfter).toBe(700);
  });
});
