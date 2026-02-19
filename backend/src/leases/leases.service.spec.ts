import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
import { UserRole } from '../users/entities/user.entity';

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

  it('rejects confirmDraft when lease is not draft', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'lease-1',
      status: LeaseStatus.ACTIVE,
    } as Lease);

    await expect(service.confirmDraft('lease-1', 'user-1')).rejects.toThrow(
      'Only draft contracts can be confirmed',
    );
  });

  it('rejects confirmDraft when draft has no text', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'lease-1',
      status: LeaseStatus.DRAFT,
      draftContractText: '',
    } as Lease);

    await expect(service.confirmDraft('lease-1', 'user-1')).rejects.toThrow(
      'Contract draft text is required',
    );
  });

  it('rejects terminate when lease is not active', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'lease-1',
      status: LeaseStatus.DRAFT,
    } as Lease);

    await expect(service.terminate('lease-1', 'x')).rejects.toThrow(
      'Only active contracts can be finalized',
    );
  });

  it('rejects renew when lease is not active/finalized', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'lease-1',
      status: LeaseStatus.DRAFT,
    } as Lease);

    await expect(service.renew('lease-1', {})).rejects.toThrow(
      'Only active or finalized contracts can be renewed',
    );
  });

  it('remove rejects active leases and soft-deletes drafts', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValueOnce({
      id: 'lease-active',
      status: LeaseStatus.ACTIVE,
    } as Lease);
    await expect(service.remove('lease-active')).rejects.toThrow(
      'Cannot delete an active contract. Finalize it first.',
    );

    jest.spyOn(service, 'findOne').mockResolvedValueOnce({
      id: 'lease-draft',
      status: LeaseStatus.DRAFT,
    } as Lease);
    leaseRepository.softDelete!.mockResolvedValue({ affected: 1 });
    await expect(service.remove('lease-draft')).resolves.toBeUndefined();
    expect(leaseRepository.softDelete).toHaveBeenCalledWith('lease-draft');
  });

  it('listTemplates supports contractType filter and updateTemplate not-found branch', async () => {
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    _templateRepository.createQueryBuilder!.mockReturnValue(query as any);

    await service.listTemplates('company-1', ContractType.RENTAL);
    expect(query.andWhere).toHaveBeenCalledWith(
      'template.contract_type = :contractType',
      { contractType: ContractType.RENTAL },
    );

    _templateRepository.findOne!.mockResolvedValue(null);
    await expect(
      service.updateTemplate('missing', { name: 'x' } as any, 'company-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('findAll applies includeFinalized and visibility scope for owner', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    leaseRepository.createQueryBuilder!.mockReturnValue(qb as any);

    await service.findAll(
      {
        includeFinalized: true,
        propertyAddress: 'CABA',
        page: 1,
        limit: 10,
      } as any,
      {
        id: 'owner-user-1',
        role: UserRole.OWNER,
        email: 'OWNER@MAIL.COM',
        phone: '1234',
      },
    );

    expect(qb.andWhere).toHaveBeenCalledWith('lease.status IN (:...statuses)', {
      statuses: [LeaseStatus.ACTIVE, LeaseStatus.FINALIZED],
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('property.address_street ILIKE :address'),
      { address: '%CABA%' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('owner.user_id = :scopeUserId'),
      expect.objectContaining({
        scopeUserId: 'owner-user-1',
        scopeEmail: 'owner@mail.com',
      }),
    );
  });

  it('findAll applies explicit status and tenant visibility scope', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    leaseRepository.createQueryBuilder!.mockReturnValue(qb as any);

    await service.findAll(
      {
        status: LeaseStatus.DRAFT,
        page: 2,
        limit: 5,
      } as any,
      {
        id: 'tenant-user-1',
        role: UserRole.TENANT,
        email: 'tenant@test.dev',
        phone: '555',
      },
    );

    expect(qb.andWhere).toHaveBeenCalledWith('lease.status = :status', {
      status: LeaseStatus.DRAFT,
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('tenant.user_id = :scopeUserId'),
      expect.objectContaining({
        scopeUserId: 'tenant-user-1',
        scopeEmail: 'tenant@test.dev',
      }),
    );
    expect(qb.skip).toHaveBeenCalledWith(5);
  });

  it('findOneScoped throws not found when query returns no lease', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    leaseRepository.createQueryBuilder!.mockReturnValue(qb as any);

    await expect(
      service.findOneScoped('missing', {
        id: 'u1',
        role: UserRole.ADMIN,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('renderDraft throws when template cannot be resolved', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'lease-1',
      companyId: 'company-1',
      status: LeaseStatus.DRAFT,
      contractType: ContractType.RENTAL,
      templateId: null,
    } as Lease);
    _templateRepository.findOne!.mockResolvedValue(null);

    await expect(
      service.renderDraft('lease-1', 'missing-template'),
    ).rejects.toThrow(NotFoundException);
  });

  it('renderDraft persists rendered contract text when template exists', async () => {
    const lease = {
      id: 'lease-1',
      companyId: 'company-1',
      status: LeaseStatus.DRAFT,
      contractType: ContractType.RENTAL,
      templateId: null,
      property: {},
      tenant: {},
      buyerProfile: {},
    } as unknown as Lease;
    const renderedLease = {
      ...lease,
      templateId: 'tpl-1',
      draftContractText: 'Contrato de lease-1',
    } as Lease;

    jest
      .spyOn(service, 'findOne')
      .mockResolvedValueOnce(lease)
      .mockResolvedValueOnce(renderedLease);
    _templateRepository.findOne!.mockResolvedValue({
      id: 'tpl-1',
      companyId: 'company-1',
      contractType: ContractType.RENTAL,
      name: 'Tpl',
      templateBody: 'Contrato de {{lease.id}}',
    } as LeaseContractTemplate);
    leaseRepository.save!.mockResolvedValue(renderedLease);

    const result = await service.renderDraft('lease-1', 'tpl-1');

    expect(leaseRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'tpl-1',
        templateName: 'Tpl',
        draftContractText: 'Contrato de lease-1',
      }),
    );
    expect(result.templateId).toBe('tpl-1');
  });

  it('renew finalizes active lease and creates revision payload', async () => {
    const activeLease = {
      id: 'lease-1',
      companyId: 'company-1',
      propertyId: 'prop-1',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
      contractType: ContractType.RENTAL,
      status: LeaseStatus.ACTIVE,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      monthlyRent: 100,
      currency: 'ARS',
    } as Lease;

    jest
      .spyOn(service, 'findOne')
      .mockResolvedValueOnce(activeLease)
      .mockResolvedValueOnce({
        id: 'lease-2',
        status: LeaseStatus.DRAFT,
      } as Lease);
    propertyRepository.findOne!.mockResolvedValue({
      id: 'prop-1',
      ownerId: 'owner-1',
    } as Property);
    leaseRepository.findOne!.mockResolvedValue(null);
    leaseRepository.create!.mockImplementation((data) => ({
      id: 'lease-2',
      ...data,
    }));
    leaseRepository.save!.mockResolvedValue({ id: 'lease-2' } as Lease);

    const result = await service.renew('lease-1', { monthlyRent: 150 });

    expect(leaseRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'lease-1', status: LeaseStatus.FINALIZED }),
    );
    expect(leaseRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: 'prop-1',
        monthlyRent: 150,
        companyId: 'company-1',
      }),
    );
    expect(result.id).toBe('lease-2');
  });

  it('renew keeps finalized lease and computes fallback dates', async () => {
    const finalizedLease = {
      id: 'lease-finalized',
      companyId: 'company-1',
      propertyId: 'prop-1',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
      contractType: ContractType.RENTAL,
      status: LeaseStatus.FINALIZED,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-07-01'),
      monthlyRent: 100,
      currency: 'ARS',
    } as Lease;

    jest
      .spyOn(service, 'findOne')
      .mockResolvedValueOnce(finalizedLease)
      .mockResolvedValueOnce({
        id: 'lease-3',
      } as Lease);
    propertyRepository.findOne!.mockResolvedValue({
      id: 'prop-1',
      ownerId: 'owner-1',
    } as Property);
    leaseRepository.findOne!.mockResolvedValue(null);
    leaseRepository.create!.mockImplementation((data) => ({
      id: 'lease-3',
      ...data,
    }));
    leaseRepository.save!.mockResolvedValue({ id: 'lease-3' } as Lease);

    await service.renew('lease-finalized', {});

    expect(leaseRepository.save).not.toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'lease-finalized',
        status: LeaseStatus.FINALIZED,
      }),
    );
    expect(leaseRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: expect.any(Date),
        endDate: expect.any(Date),
      }),
    );
  });

  it('createTemplate and updateTemplate persist normalized values', async () => {
    _templateRepository.create!.mockImplementation((data) => data);
    _templateRepository.save!.mockImplementation(async (data) => data);
    _templateRepository.findOne!.mockResolvedValue({
      id: 'tpl-1',
      companyId: 'company-1',
      name: 'Old',
      contractType: ContractType.RENTAL,
      templateBody: 'Old body',
      isActive: true,
    });

    const created = await service.createTemplate(
      {
        name: '  Nuevo  ',
        contractType: ContractType.RENTAL,
        templateBody: 'Body',
      } as any,
      'company-1',
    );
    const updated = await service.updateTemplate(
      'tpl-1',
      {
        name: '  Updated  ',
        isActive: false,
        templateBody: 'Body 2',
      } as any,
      'company-1',
    );

    expect(created).toEqual(
      expect.objectContaining({
        name: 'Nuevo',
        isActive: true,
      }),
    );
    expect(updated).toEqual(
      expect.objectContaining({
        name: 'Updated',
        isActive: false,
        templateBody: 'Body 2',
      }),
    );
  });

  it('throws when creating with unknown template id', async () => {
    propertyRepository.findOne!.mockResolvedValue({
      id: 'prop-1',
      ownerId: 'owner-1',
    } as Property);
    _templateRepository.findOne!.mockResolvedValue(null);

    await expect(
      service.create({
        companyId: 'company-1',
        propertyId: 'prop-1',
        ownerId: 'owner-1',
        tenantId: 'tenant-1',
        contractType: ContractType.RENTAL,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        monthlyRent: 1000,
        templateId: 'missing-template',
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateDraftText enforces draft status and saves text', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValueOnce({
      id: 'lease-1',
      status: LeaseStatus.ACTIVE,
    } as Lease);

    await expect(
      service.updateDraftText('lease-1', 'x'),
    ).rejects.toBeInstanceOf(BadRequestException);

    const draft = {
      id: 'lease-2',
      status: LeaseStatus.DRAFT,
      draftContractText: null,
    } as Lease;
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce({ ...draft, draftContractText: 'Nuevo texto' });
    leaseRepository.save!.mockResolvedValue({
      ...draft,
      draftContractText: 'Nuevo texto',
    } as Lease);

    const result = await service.updateDraftText('lease-2', 'Nuevo texto');
    expect(result.draftContractText).toBe('Nuevo texto');
  });

  it('confirmDraft for sale marks property as sold and does not create tenant account', async () => {
    const saleDraft = {
      id: 'lease-sale-1',
      companyId: 'company-1',
      propertyId: 'prop-1',
      status: LeaseStatus.DRAFT,
      contractType: ContractType.SALE,
      draftContractText: 'Contrato final',
    } as Lease;
    const saleActive = {
      ...saleDraft,
      status: LeaseStatus.ACTIVE,
      confirmedContractText: 'Contrato final',
    } as Lease;

    jest
      .spyOn(service, 'findOne')
      .mockResolvedValueOnce(saleDraft)
      .mockResolvedValueOnce(saleActive);
    leaseRepository.save!.mockResolvedValue(saleActive);
    propertyRepository.update!.mockResolvedValue({ affected: 1 });
    pdfService.generateContract.mockResolvedValue({
      id: 'doc-1',
      fileUrl: 'db://document/doc-1',
    });

    const result = await service.confirmDraft('lease-sale-1', 'user-1');

    expect(propertyRepository.update).toHaveBeenCalledWith('prop-1', {
      operationState: PropertyOperationState.SOLD,
    });
    expect(tenantAccountsService.createForLease).not.toHaveBeenCalled();
    expect(result.status).toBe(LeaseStatus.ACTIVE);
  });

  it('update creates revision when original lease is not draft', async () => {
    const original = {
      id: 'lease-1',
      companyId: 'company-1',
      status: LeaseStatus.ACTIVE,
      contractType: ContractType.RENTAL,
      propertyId: 'prop-1',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      monthlyRent: 100,
      versionNumber: 1,
      draftContractText: null,
      confirmedContractText: 'texto confirmado',
      lateFeeType: 'none',
      lateFeeValue: 0,
      adjustmentValue: 0,
    } as unknown as Lease;

    jest
      .spyOn(service, 'findOne')
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce({
        id: 'lease-rev-1',
        status: LeaseStatus.DRAFT,
      } as Lease);
    propertyRepository.findOne!.mockResolvedValue({
      id: 'prop-1',
      ownerId: 'owner-1',
    } as Property);
    _templateRepository.findOne!.mockResolvedValue(null);
    leaseRepository.create!.mockImplementation((data) => ({
      id: 'lease-rev-1',
      ...data,
    }));
    leaseRepository
      .save!.mockResolvedValueOnce({
        id: 'lease-rev-1',
        templateId: null,
        draftContractText: null,
      } as Lease)
      .mockResolvedValueOnce({
        id: 'lease-rev-1',
        draftContractText: 'texto confirmado',
      } as Lease);

    const result = await service.update('lease-1', { monthlyRent: 150 } as any);

    expect(leaseRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        previousLeaseId: 'lease-1',
        versionNumber: 2,
      }),
    );
    expect(leaseRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'lease-rev-1',
        draftContractText: 'texto confirmado',
      }),
    );
    expect(result.id).toBe('lease-rev-1');
  });
});
