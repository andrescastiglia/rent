import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { LeasesService } from './leases.service';
import { ContractType, Lease, LeaseStatus } from './entities/lease.entity';
import {
  Property,
  PropertyOperationState,
} from '../properties/entities/property.entity';
import { InterestedProfile } from '../interested/entities/interested-profile.entity';
import { PdfService } from './pdf.service';
import { LeaseContractTemplate } from './entities/lease-contract-template.entity';
import { TenantAccountsService } from '../payments/tenant-accounts.service';

type MockRepository<T extends Record<string, any> = any> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

const createMockRepository = (): MockRepository => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  })),
});

describe('LeasesService', () => {
  let service: LeasesService;
  let leaseRepository: MockRepository<Lease>;
  let _templateRepository: MockRepository<LeaseContractTemplate>;
  let propertyRepository: MockRepository<Property>;
  let interestedRepository: MockRepository<InterestedProfile>;
  let pdfService: { generateContract: jest.Mock };
  let tenantAccountsService: { createForLease: jest.Mock };

  beforeEach(async () => {
    pdfService = {
      generateContract: jest.fn(),
    };
    tenantAccountsService = {
      createForLease: jest.fn().mockResolvedValue({ id: 'tenant-account-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeasesService,
        {
          provide: getRepositoryToken(Lease),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(LeaseContractTemplate),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Property),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(InterestedProfile),
          useValue: createMockRepository(),
        },
        { provide: PdfService, useValue: pdfService },
        { provide: TenantAccountsService, useValue: tenantAccountsService },
      ],
    }).compile();

    service = module.get(LeasesService);
    leaseRepository = module.get(getRepositoryToken(Lease));
    _templateRepository = module.get(getRepositoryToken(LeaseContractTemplate));
    propertyRepository = module.get(getRepositoryToken(Property));
    interestedRepository = module.get(getRepositoryToken(InterestedProfile));
  });

  it('creates a rental lease in draft', async () => {
    const property = { id: 'prop-1', ownerId: 'owner-1' } as Property;
    const payload = {
      id: 'lease-1',
      companyId: 'company-1',
      propertyId: property.id,
      ownerId: property.ownerId,
      tenantId: 'tenant-1',
      contractType: ContractType.RENTAL,
      status: LeaseStatus.DRAFT,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      monthlyRent: 1000,
      currency: 'ARS',
      paymentFrequency: 'monthly',
    } as unknown as Lease;

    propertyRepository.findOne!.mockResolvedValue(property);
    leaseRepository
      .findOne!.mockResolvedValueOnce(null)
      .mockResolvedValueOnce(payload);
    leaseRepository.create!.mockReturnValue(payload);
    leaseRepository.save!.mockResolvedValue(payload);

    const result = await service.create({
      companyId: 'company-1',
      propertyId: 'prop-1',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
      contractType: ContractType.RENTAL,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      monthlyRent: 1000,
    } as any);

    expect(result.status).toBe(LeaseStatus.DRAFT);
    expect(leaseRepository.create).toHaveBeenCalled();
  });

  it('rejects creating rental if property already has active rental', async () => {
    propertyRepository.findOne!.mockResolvedValue({
      id: 'prop-1',
      ownerId: 'owner-1',
    } as Property);
    leaseRepository.findOne!.mockResolvedValue({
      id: 'existing',
      status: LeaseStatus.ACTIVE,
      contractType: ContractType.RENTAL,
      propertyId: 'prop-1',
    } as Lease);

    await expect(
      service.create({
        companyId: 'company-1',
        propertyId: 'prop-1',
        tenantId: 'tenant-1',
        ownerId: 'owner-1',
        contractType: ContractType.RENTAL,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        monthlyRent: 1000,
      } as any),
    ).rejects.toThrow(ConflictException);
  });

  it('activates a draft rental and marks property rented', async () => {
    const draft = {
      id: 'lease-1',
      status: LeaseStatus.DRAFT,
      contractType: ContractType.RENTAL,
      propertyId: 'prop-1',
      companyId: 'company-1',
      draftContractText: 'Contrato borrador',
    } as Lease;
    const active = { ...draft, status: LeaseStatus.ACTIVE } as Lease;

    jest
      .spyOn(service, 'findOne')
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(active);
    leaseRepository.findOne!.mockResolvedValue(null);
    leaseRepository.save!.mockResolvedValueOnce(active).mockResolvedValueOnce({
      ...active,
      contractPdfUrl: 'db://document/doc-1',
    } as Lease);
    propertyRepository.update!.mockResolvedValue({ affected: 1 });
    pdfService.generateContract.mockResolvedValue({
      id: 'doc-1',
      fileUrl: 'db://document/doc-1',
    });

    const result = await service.activate('lease-1', 'user-1');

    expect(propertyRepository.update).toHaveBeenCalledWith('prop-1', {
      operationState: PropertyOperationState.RENTED,
    });
    expect(result.status).toBe(LeaseStatus.ACTIVE);
  });

  it('finalizes an active rental and marks property available', async () => {
    const active = {
      id: 'lease-1',
      status: LeaseStatus.ACTIVE,
      contractType: ContractType.RENTAL,
      propertyId: 'prop-1',
    } as Lease;

    jest.spyOn(service, 'findOne').mockResolvedValue(active);
    leaseRepository.save!.mockResolvedValue({
      ...active,
      status: LeaseStatus.FINALIZED,
    });
    propertyRepository.update!.mockResolvedValue({ affected: 1 });

    const result = await service.terminate('lease-1', 'done');

    expect(result.status).toBe(LeaseStatus.FINALIZED);
    expect(propertyRepository.update).toHaveBeenCalledWith('prop-1', {
      operationState: PropertyOperationState.AVAILABLE,
    });
  });

  it('throws not found when loading unknown lease', async () => {
    leaseRepository.findOne!.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('validates buyer exists for sale', async () => {
    propertyRepository.findOne!.mockResolvedValue({
      id: 'prop-1',
      ownerId: 'owner-1',
    } as Property);
    interestedRepository.findOne!.mockResolvedValue(null);

    await expect(
      service.create({
        companyId: 'company-1',
        propertyId: 'prop-1',
        ownerId: 'owner-1',
        contractType: ContractType.SALE,
        buyerProfileId: 'buyer-1',
        fiscalValue: 100000,
      } as any),
    ).rejects.toThrow(NotFoundException);
  });
});
