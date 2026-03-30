import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as mammoth from 'mammoth';
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
import { Buyer } from '../buyers/entities/buyer.entity';
import { Document } from '../documents/entities/document.entity';

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
    getOne: jest.fn().mockResolvedValue(null),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  })),
});

describe('LeasesService', () => {
  let service: LeasesService;
  let leaseRepository: MockRepository<Lease>;
  let _templateRepository: MockRepository<LeaseContractTemplate>;
  let propertyRepository: MockRepository<Property>;
  let interestedRepository: MockRepository<InterestedProfile>;
  let buyerRepository: MockRepository<Buyer>;
  let documentRepository: MockRepository<Document>;
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
        {
          provide: getRepositoryToken(Buyer),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Document),
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
    buyerRepository = module.get(getRepositoryToken(Buyer));
    documentRepository = module.get(getRepositoryToken(Document));
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

  it('imports legacy .doc contracts as rich text without OCR', async () => {
    const property = { id: 'prop-1', ownerId: 'owner-1' } as Property;
    const buyer = {
      id: 'buyer-1',
      user: { firstName: 'Buyer', lastName: 'User' },
    } as Buyer;
    const importedLease = {
      id: 'lease-imported-1',
      companyId: 'company-1',
      propertyId: property.id,
      ownerId: property.ownerId,
      buyerId: buyer.id,
      contractType: ContractType.SALE,
      status: LeaseStatus.ACTIVE,
      draftContractText: '<p>Contrato legado</p>',
      draftContractFormat: 'html',
      confirmedContractText: '<p>Contrato legado</p>',
      confirmedContractFormat: 'html',
    } as unknown as Lease;

    propertyRepository.findOne!.mockResolvedValue(property);
    buyerRepository.findOne!.mockResolvedValue(buyer);
    leaseRepository.create!.mockReturnValue(importedLease);
    leaseRepository
      .save!.mockResolvedValueOnce(importedLease)
      .mockResolvedValueOnce({
        ...importedLease,
        contractPdfUrl: 'db://document/doc-1',
      } as Lease);
    documentRepository.create!.mockImplementation((value) => value as any);
    documentRepository
      .save!.mockResolvedValueOnce({
        id: 'doc-1',
        fileUrl: 'db://document/pending',
      } as any)
      .mockResolvedValueOnce({
        id: 'doc-1',
        fileUrl: 'db://document/doc-1',
      } as any);
    jest
      .spyOn(service as any, 'convertLegacyWordDocumentToHtml')
      .mockResolvedValue('<p>Contrato legado</p>');
    jest.spyOn(service, 'findOne').mockResolvedValue(importedLease);

    const result = await service.importCurrentContract(
      {
        buffer: Buffer.from('doc'),
        mimetype: 'application/msword',
        originalname: 'contrato.doc',
        size: 128,
      },
      {
        propertyId: property.id,
        ownerId: property.ownerId,
        contractType: ContractType.SALE,
        buyerId: buyer.id,
      } as any,
      'company-1',
    );

    expect(result.draftContractFormat).toBe('html');
    expect(documentRepository.save).toHaveBeenCalled();
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
    buyerRepository.findOne!.mockResolvedValue(null);

    await expect(
      service.create({
        companyId: 'company-1',
        propertyId: 'prop-1',
        ownerId: 'owner-1',
        contractType: ContractType.SALE,
        buyerId: 'buyer-1',
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
      'The contract content could not be interpreted',
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
      buyer: {},
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

  describe('private helpers', () => {
    it('escapeHtml escapes special characters', () => {
      const s = service as any;
      expect(s.escapeHtml('<b>"Hello" & \'world\'</b>')).toBe(
        '&lt;b&gt;&quot;Hello&quot; &amp; &#39;world&#39;&lt;/b&gt;',
      );
    });

    it('plainTextToHtml converts paragraphs with line breaks', () => {
      const s = service as any;
      expect(s.plainTextToHtml('Line 1\nLine 2\n\nParagraph 2')).toBe(
        '<p>Line 1<br />Line 2</p><p>Paragraph 2</p>',
      );
      expect(s.plainTextToHtml('')).toBe('');
    });

    it('resolveTemplateValue navigates nested paths', () => {
      const s = service as any;
      const ctx = { a: { b: { c: 42 } } };
      expect(s.resolveTemplateValue(ctx, 'a.b.c')).toBe(42);
      expect(s.resolveTemplateValue(ctx, 'a.x')).toBeUndefined();
      expect(s.resolveTemplateValue(ctx, 'missing')).toBeUndefined();
    });

    it('isTemplateRenderableValue accepts primitives only', () => {
      const s = service as any;
      expect(s.isTemplateRenderableValue('hello')).toBe(true);
      expect(s.isTemplateRenderableValue(123)).toBe(true);
      expect(s.isTemplateRenderableValue(true)).toBe(true);
      expect(s.isTemplateRenderableValue(BigInt(1))).toBe(true);
      expect(s.isTemplateRenderableValue(null)).toBe(false);
      expect(s.isTemplateRenderableValue(undefined)).toBe(false);
      expect(s.isTemplateRenderableValue('')).toBe(false);
      expect(s.isTemplateRenderableValue({})).toBe(false);
      expect(s.isTemplateRenderableValue(() => {})).toBe(false);
      expect(s.isTemplateRenderableValue(Symbol('x'))).toBe(false);
    });

    it('parseOptionalNumber handles all branches', () => {
      const s = service as any;
      expect(s.parseOptionalNumber(undefined)).toBeNull();
      expect(s.parseOptionalNumber(null)).toBeNull();
      expect(s.parseOptionalNumber('')).toBeNull();
      expect(s.parseOptionalNumber('42')).toBe(42);
      expect(s.parseOptionalNumber('3.14')).toBeCloseTo(3.14);
      expect(() => s.parseOptionalNumber('abc')).toThrow(
        'Invalid numeric value',
      );
    });

    it('normalizeContractBody with plain text', () => {
      const s = service as any;
      expect(s.normalizeContractBody('  Hello  ', 'plain_text')).toBe('Hello');
      expect(() => s.normalizeContractBody('', 'plain_text')).toThrow(
        'The contract content could not be interpreted',
      );
    });

    it('normalizeContractBody with html validates text content', () => {
      const s = service as any;
      expect(() => s.normalizeContractBody('<div>  </div>', 'html')).toThrow(
        'The contract content could not be interpreted',
      );
      expect(s.normalizeContractBody('<p>Contrato</p>', 'html')).toBe(
        '<p>Contrato</p>',
      );
    });

    it('validateRentalDates throws on missing or invalid dates', () => {
      const s = service as any;
      expect(() => s.validateRentalDates(undefined, '2025-12-31')).toThrow(
        'Rental contracts require startDate and endDate',
      );
      expect(() => s.validateRentalDates('not-valid', '2025-12-31')).toThrow(
        'Invalid contract dates',
      );
      expect(() => s.validateRentalDates('2025-12-31', '2025-01-01')).toThrow(
        'End date must be after start date',
      );
    });

    it('validateRentalCreate throws on missing fields', () => {
      const s = service as any;
      expect(() =>
        s.validateRentalCreate({
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          monthlyRent: 1000,
        }),
      ).toThrow('Rental contracts require tenantId');
      expect(() =>
        s.validateRentalCreate({
          tenantId: 't1',
          startDate: '2025-01-01',
          endDate: '2025-12-31',
        }),
      ).toThrow('Rental contracts require monthlyRent');
    });

    it('getUploadedFileExtension returns correct extension', () => {
      const s = service as any;
      expect(s.getUploadedFileExtension('contract.pdf')).toBe('pdf');
      expect(s.getUploadedFileExtension('doc.DOCX')).toBe('docx');
      expect(s.getUploadedFileExtension('noextension')).toBe('');
    });

    it('computeRenewedEndDate preserves original duration', () => {
      const s = service as any;
      const result = s.computeRenewedEndDate(
        '2026-01-01',
        new Date('2025-01-01'),
        new Date('2025-07-01'),
      );
      expect(result).toBe('2026-07-01');
    });

    it('computeRenewedEndDate falls back to 1 year when no original dates', () => {
      const s = service as any;
      const result = s.computeRenewedEndDate('2026-01-01', null, null);
      expect(result).toBe('2027-01-01');
    });

    it('computeRenewedEndDate returns input when invalid start', () => {
      const s = service as any;
      const result = s.computeRenewedEndDate('bad-date', null, null);
      expect(result).toBe('bad-date');
    });
  });

  describe('validateSaleCreate', () => {
    it('throws when buyerId is missing', async () => {
      await expect(
        (service as any).validateSaleCreate({ fiscalValue: 100000 }),
      ).rejects.toThrow('Sale contracts require buyerId');
    });

    it('throws when fiscalValue is missing', async () => {
      await expect(
        (service as any).validateSaleCreate({ buyerId: 'b1' }),
      ).rejects.toThrow('Sale contracts require fiscalValue');
    });

    it('throws when buyer not found', async () => {
      buyerRepository.findOne!.mockResolvedValue(null);
      await expect(
        (service as any).validateSaleCreate({
          buyerId: 'b1',
          fiscalValue: 100000,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('normalizeBuyerInputs', () => {
    it('returns early when buyerId is present', async () => {
      const dto = { buyerId: 'b1' };
      await (service as any).normalizeBuyerInputs(dto);
      expect(interestedRepository.findOne).not.toHaveBeenCalled();
    });

    it('returns early when no buyerProfileId', async () => {
      const dto = {};
      await (service as any).normalizeBuyerInputs(dto);
      expect(interestedRepository.findOne).not.toHaveBeenCalled();
    });

    it('throws when profile not found', async () => {
      interestedRepository.findOne!.mockResolvedValue(null);
      await expect(
        (service as any).normalizeBuyerInputs({ buyerProfileId: 'p1' }),
      ).rejects.toThrow('Interested buyer profile not found');
    });

    it('throws when profile not converted', async () => {
      interestedRepository.findOne!.mockResolvedValue({
        id: 'p1',
        convertedToBuyerId: null,
      });
      await expect(
        (service as any).normalizeBuyerInputs({ buyerProfileId: 'p1' }),
      ).rejects.toThrow(
        'Interested buyer profile must be converted before creating a sale contract',
      );
    });

    it('sets buyerId from converted profile', async () => {
      interestedRepository.findOne!.mockResolvedValue({
        id: 'p1',
        convertedToBuyerId: 'buyer-from-profile',
      });
      const dto: any = { buyerProfileId: 'p1' };
      await (service as any).normalizeBuyerInputs(dto);
      expect(dto.buyerId).toBe('buyer-from-profile');
    });
  });

  describe('visibility scope for buyer role', () => {
    it('filters by buyer user identity', () => {
      const qb = { andWhere: jest.fn() };
      (service as any).applyVisibilityScope(qb, {
        id: 'buyer-user-1',
        role: UserRole.BUYER,
        email: 'buyer@test.com',
        phone: '999',
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('buyer.user_id = :scopeUserId'),
        expect.objectContaining({
          scopeUserId: 'buyer-user-1',
          scopeEmail: 'buyer@test.com',
          scopePhone: '999',
        }),
      );
    });

    it('staff/admin visibility returns early without filters', () => {
      const qb = { andWhere: jest.fn() };
      (service as any).applyVisibilityScope(qb, {
        id: 'u1',
        role: UserRole.STAFF,
      });
      expect(qb.andWhere).not.toHaveBeenCalled();
    });
  });

  describe('confirmDraft finalizes existing active lease', () => {
    it('should finalize existing active rental before confirming draft', async () => {
      const draft = {
        id: 'lease-new',
        companyId: 'c1',
        propertyId: 'prop-1',
        status: LeaseStatus.DRAFT,
        contractType: ContractType.RENTAL,
        draftContractText: '<p>Contrato</p>',
        draftContractFormat: 'html',
        property: { name: 'Prop' },
        tenant: { user: { firstName: 'T', lastName: 'U' } },
        buyer: {},
      } as unknown as Lease;

      const existingActive = {
        id: 'lease-old',
        status: LeaseStatus.ACTIVE,
        contractType: ContractType.RENTAL,
        propertyId: 'prop-1',
      } as Lease;

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce({
          ...draft,
          status: LeaseStatus.ACTIVE,
        } as Lease);

      leaseRepository.findOne!.mockResolvedValue(existingActive);
      leaseRepository.save!.mockImplementation(async (d) => d);
      propertyRepository.update!.mockResolvedValue({ affected: 1 });
      pdfService.generateContract.mockResolvedValue({
        id: 'doc-1',
        fileUrl: 'db://document/doc-1',
      });

      await service.confirmDraft('lease-new', 'user-1');

      expect(leaseRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'lease-old',
          status: LeaseStatus.FINALIZED,
        }),
      );
    });
  });

  describe('importTemplateFromDocx', () => {
    it('throws when no file provided', async () => {
      await expect(
        service.importTemplateFromDocx(null as any, {} as any, 'c1'),
      ).rejects.toThrow('DOCX file is required');
    });

    it('throws when mimetype is not docx', async () => {
      await expect(
        service.importTemplateFromDocx(
          {
            buffer: Buffer.from('x'),
            mimetype: 'application/pdf',
            originalname: 'file.pdf',
            size: 1,
          },
          {} as any,
          'c1',
        ),
      ).rejects.toThrow('Only .docx files are supported');
    });

    it('truncates imported source metadata to fit persisted column limits', async () => {
      jest.spyOn(mammoth, 'convertToHtml').mockResolvedValue({
        value: '<p>Template</p>',
        messages: [],
      });
      const mimetype =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      const result = await service.importTemplateFromDocx(
        {
          buffer: Buffer.from('x'),
          mimetype,
          originalname: `${'a'.repeat(300)}.docx`,
          size: 1,
        },
        { contractType: ContractType.RENTAL } as any,
        'c1',
      );

      expect(result.sourceFileName).toHaveLength(255);
      expect(result.sourceMimeType).toBe(mimetype);
    });
  });

  describe('extractTextFromUploadedContract', () => {
    it('throws on unsupported extension', async () => {
      await expect(
        (service as any).extractTextFromUploadedContract({
          buffer: Buffer.from('x'),
          mimetype: 'application/zip',
          originalname: 'file.zip',
          size: 1,
        }),
      ).rejects.toThrow(
        'Only md, doc, docx, txt and pdf contracts are accepted',
      );
    });

    it('throws on image mimetype', async () => {
      await expect(
        (service as any).extractTextFromUploadedContract({
          buffer: Buffer.from('x'),
          mimetype: 'image/png',
          originalname: 'file.txt',
          size: 1,
        }),
      ).rejects.toThrow('Image-based contracts are not supported');
    });

    it('handles txt files', async () => {
      const result = await (service as any).extractTextFromUploadedContract({
        buffer: Buffer.from('Paragraph one\n\nParagraph two'),
        mimetype: 'text/plain',
        originalname: 'contract.txt',
        size: 28,
      });
      expect(result.format).toBe('html');
      expect(result.content).toContain('<p>Paragraph one</p>');
      expect(result.content).toContain('<p>Paragraph two</p>');
    });

    it('handles md files', async () => {
      jest
        .spyOn(service as any, 'renderMarkdownAsHtml')
        .mockResolvedValue('<h1>Title</h1><p>Content here</p>');

      const result = await (service as any).extractTextFromUploadedContract({
        buffer: Buffer.from('# Title\n\nContent here'),
        mimetype: 'text/markdown',
        originalname: 'contract.md',
        size: 22,
      });
      expect(result.format).toBe('html');
      expect(result.content).toContain('Title');
    });
  });

  describe('findAll additional filters', () => {
    it('applies contractType, propertyId, tenantId, buyerId, buyerProfileId filters', async () => {
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

      await service.findAll({
        propertyId: 'p1',
        tenantId: 't1',
        buyerId: 'b1',
        buyerProfileId: 'bp1',
        contractType: ContractType.SALE,
        page: 1,
        limit: 10,
      } as any);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'lease.property_id = :propertyId',
        { propertyId: 'p1' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('lease.tenant_id = :tenantId', {
        tenantId: 't1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('lease.buyer_id = :buyerId', {
        buyerId: 'b1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'buyer.interested_profile_id = :buyerProfileId',
        { buyerProfileId: 'bp1' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'lease.contract_type = :contractType',
        { contractType: ContractType.SALE },
      );
    });

    it('applies default active status when no status/includeFinalized', async () => {
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

      await service.findAll({ page: 1, limit: 10 } as any);

      expect(qb.andWhere).toHaveBeenCalledWith('lease.status = :activeStatus', {
        activeStatus: LeaseStatus.ACTIVE,
      });
    });
  });

  describe('update draft lease', () => {
    it('updates a draft lease in place and re-renders template', async () => {
      const draft = {
        id: 'lease-draft',
        status: LeaseStatus.DRAFT,
        contractType: ContractType.RENTAL,
        companyId: 'c1',
        propertyId: 'prop-1',
        ownerId: 'owner-1',
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        templateId: 'tpl-1',
        draftContractText: 'old text',
      } as Lease;

      jest.spyOn(service, 'findOne').mockResolvedValueOnce(draft);

      leaseRepository.save!.mockResolvedValue({
        ...draft,
        monthlyRent: 200,
        templateId: 'tpl-1',
      } as Lease);

      jest
        .spyOn(service, 'renderDraft')
        .mockResolvedValue({ ...draft, monthlyRent: 200 } as Lease);

      const result = await service.update('lease-draft', {
        monthlyRent: 200,
      } as any);

      expect(result.monthlyRent).toBe(200);
    });
  });

  describe('confirmDraft PDF generation failure', () => {
    it('should still succeed when PDF generation throws', async () => {
      const draft = {
        id: 'lease-pdf-fail',
        companyId: 'c1',
        propertyId: 'prop-1',
        status: LeaseStatus.DRAFT,
        contractType: ContractType.RENTAL,
        draftContractText: 'Text',
        draftContractFormat: 'plain_text',
        property: { name: 'P' },
        tenant: { user: { firstName: 'A', lastName: 'B' } },
        buyer: {},
      } as unknown as Lease;

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce({
          ...draft,
          status: LeaseStatus.ACTIVE,
        } as Lease);
      leaseRepository.findOne!.mockResolvedValue(null);
      leaseRepository.save!.mockImplementation(async (d) => d);
      propertyRepository.update!.mockResolvedValue({ affected: 1 });
      pdfService.generateContract.mockRejectedValue(new Error('PDF error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await service.confirmDraft('lease-pdf-fail', 'user-1');

      expect(result.status).toBe(LeaseStatus.ACTIVE);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to generate contract PDF:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });
});
