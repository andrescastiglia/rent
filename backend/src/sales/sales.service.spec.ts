import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesService } from './sales.service';
import { SaleFolder } from './entities/sale-folder.entity';
import { SaleAgreement } from './entities/sale-agreement.entity';
import { SaleReceipt } from './entities/sale-receipt.entity';
import { SaleReceiptPdfService } from './sale-receipt-pdf.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

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
    createQueryBuilder: jest.fn(),
  });

  beforeEach(async () => {
    receiptPdfService = {
      generate: jest.fn().mockResolvedValue('s3://receipt.pdf'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        {
          provide: getRepositoryToken(SaleFolder),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(SaleAgreement),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(SaleReceipt),
          useValue: createMockRepository(),
        },
        { provide: SaleReceiptPdfService, useValue: receiptPdfService },
      ],
    }).compile();

    service = module.get(SalesService);
    foldersRepository = module.get(getRepositoryToken(SaleFolder));
    agreementsRepository = module.get(getRepositoryToken(SaleAgreement));
    receiptsRepository = module.get(getRepositoryToken(SaleReceipt));
  });

  it('createFolder requires company scope', async () => {
    await expect(
      service.createFolder({ name: 'Ventas' } as any, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createFolder persists folder for company', async () => {
    foldersRepository.create!.mockReturnValue({ id: 'f1' });
    foldersRepository.save!.mockResolvedValue({ id: 'f1' });
    await expect(
      service.createFolder({ name: 'Ventas', description: 'x' } as any, {
        companyId: 'c1',
      }),
    ).resolves.toEqual({ id: 'f1' });
    expect(foldersRepository.create).toHaveBeenCalledWith({
      companyId: 'c1',
      name: 'Ventas',
      description: 'x',
    });
  });

  it('listFolders requires company scope and filters deleted rows', async () => {
    await expect(service.listFolders({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    foldersRepository.find!.mockResolvedValue([{ id: 'f1' }]);
    await expect(service.listFolders({ companyId: 'c1' })).resolves.toEqual([
      { id: 'f1' },
    ]);
    expect(foldersRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'c1' }),
      }),
    );
  });

  it('createAgreement validates scope and folder existence', async () => {
    await expect(
      service.createAgreement({ folderId: 'f1' } as any, {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    foldersRepository.findOne!.mockResolvedValue(null);
    await expect(
      service.createAgreement({ folderId: 'missing' } as any, {
        companyId: 'c1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createAgreement saves entity with default due day and currency', async () => {
    foldersRepository.findOne!.mockResolvedValue({ id: 'f1' });
    agreementsRepository.create!.mockReturnValue({ id: 'a1' });
    agreementsRepository.save!.mockResolvedValue({ id: 'a1' });

    await expect(
      service.createAgreement(
        {
          folderId: 'f1',
          buyerName: 'Ana',
          buyerPhone: '123',
          totalAmount: 1000,
          installmentAmount: 100,
          installmentCount: 10,
          startDate: '2024-01-01',
        } as any,
        { companyId: 'c1' },
      ),
    ).resolves.toEqual({ id: 'a1' });

    expect(agreementsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'c1',
        currency: 'ARS',
        dueDay: 10,
      }),
    );
  });

  it('listAgreements builds query and supports folder filter', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: 'a1' }]),
    };
    agreementsRepository.createQueryBuilder!.mockReturnValue(qb);

    await expect(service.listAgreements({ companyId: 'c1' })).resolves.toEqual([
      { id: 'a1' },
    ]);
    await service.listAgreements({ companyId: 'c1' }, 'f1');
    expect(qb.andWhere).toHaveBeenCalledWith(
      'agreement.folder_id = :folderId',
      {
        folderId: 'f1',
      },
    );

    await expect(service.listAgreements({}, 'f1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('getAgreement enforces company scope and existence', async () => {
    await expect(service.getAgreement('a1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    agreementsRepository.findOne!.mockResolvedValue(null);
    await expect(
      service.getAgreement('missing', { companyId: 'c1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listReceipts verifies agreement before listing', async () => {
    jest.spyOn(service, 'getAgreement').mockResolvedValue({ id: 'a1' } as any);
    receiptsRepository.find!.mockResolvedValue([{ id: 'r1' }]);
    await expect(
      service.listReceipts('a1', { companyId: 'c1' }),
    ).resolves.toEqual([{ id: 'r1' }]);
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
    receiptsRepository.create!.mockImplementation((data) => ({
      id: 'rec-1',
      ...data,
    }));
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

  it('createReceipt throws on invalid payment date', async () => {
    jest.spyOn(service, 'getAgreement').mockResolvedValue({
      id: 'agr-1',
      totalAmount: 1000,
      installmentAmount: 100,
      installmentCount: 10,
      startDate: '2024-01-01',
      dueDay: 10,
      paidAmount: 0,
      currency: 'ARS',
    } as any);

    await expect(
      service.createReceipt(
        'agr-1',
        { amount: 100, paymentDate: 'invalid-date' } as any,
        { companyId: 'company-1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createReceipt keeps flow when pdf generation fails', async () => {
    const agreement = {
      id: 'agr-2',
      totalAmount: 500,
      installmentAmount: 100,
      installmentCount: 5,
      startDate: '2024-01-01',
      dueDay: 10,
      paidAmount: 100,
      currency: 'ARS',
    } as any;
    jest.spyOn(service, 'getAgreement').mockResolvedValue(agreement);
    receiptsRepository.count!.mockResolvedValue(0);
    agreementsRepository.save!.mockResolvedValue(agreement);
    receiptsRepository.findOne!.mockResolvedValue({
      receiptNumber: 'SREC-agr-0009',
    });
    receiptsRepository.create!.mockImplementation((data) => ({
      id: 'rec-2',
      ...data,
    }));
    receiptsRepository.save!.mockImplementation(async (data) => data);
    (receiptPdfService.generate as jest.Mock).mockRejectedValue(
      new Error('pdf failed'),
    );
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await service.createReceipt(
      'agr-2',
      { amount: 100, paymentDate: '2024-03-11' } as any,
      { companyId: 'company-1' },
    );

    expect(result.id).toBe('rec-2');
    expect(result.pdfUrl).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('getReceipt validates existence and company access', async () => {
    receiptsRepository.findOne!.mockResolvedValueOnce(null);
    await expect(
      service.getReceipt('missing', { companyId: 'c1' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    receiptsRepository.findOne!.mockResolvedValueOnce({
      id: 'r1',
      agreement: { companyId: 'other' },
    });
    await expect(
      service.getReceipt('r1', { companyId: 'c1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const receipt = { id: 'r2', agreement: { companyId: 'c1' } };
    receiptsRepository.findOne!.mockResolvedValueOnce(receipt);
    await expect(service.getReceipt('r2', { companyId: 'c1' })).resolves.toBe(
      receipt,
    );
  });
});
