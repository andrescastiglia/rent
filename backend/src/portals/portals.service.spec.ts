import { PortalPublicationOutboxService } from './portal-publication-outbox.service';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PortalsService } from './portals.service';
import {
  PortalListing,
  PortalListingStatus,
  PortalName,
} from './entities/portal-listing.entity';
import { Property, PropertyType } from '../properties/entities/property.entity';

type MockRepository<T extends Record<string, any> = any> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

const createMockRepository = (): MockRepository => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
});

const mockProperty = (overrides: Partial<Property> = {}): Property =>
  ({
    id: 'property-uuid-1',
    companyId: 'company-uuid-1',
    name: 'Apartment 1A',
    propertyType: PropertyType.APARTMENT,
    addressStreet: 'Corrientes',
    addressNumber: '1234',
    addressFloor: '3',
    addressApartment: 'A',
    addressCity: 'Buenos Aires',
    addressState: 'CABA',
    addressCountry: 'Argentina',
    description: 'Nice apartment',
    rentPrice: 150000,
    ...overrides,
  }) as Property;

const mockListing = (overrides: Partial<PortalListing> = {}): PortalListing =>
  ({
    id: 'listing-uuid-1',
    companyId: 'company-uuid-1',
    propertyId: 'property-uuid-1',
    portal: PortalName.MERCADOLIBRE,
    status: PortalListingStatus.DRAFT,
    externalId: null,
    externalUrl: null,
    publishedAt: null,
    lastSyncedAt: null,
    errorMessage: null,
    listingData: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    property: mockProperty(),
    ...overrides,
  }) as PortalListing;

describe('PortalsService', () => {
  let service: PortalsService;
  let listingsRepository: MockRepository<PortalListing>;
  let propertiesRepository: MockRepository<Property>;

  const publications = {
    enqueue: jest.fn(),
    assertEnabled: jest.fn(),
    validateListingData: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    publications.validateListingData.mockImplementation((data) => data);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalsService,
        { provide: PortalPublicationOutboxService, useValue: publications },
        {
          provide: getRepositoryToken(PortalListing),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Property),
          useValue: createMockRepository(),
        },
      ],
    }).compile();

    service = module.get(PortalsService);
    listingsRepository = module.get(getRepositoryToken(PortalListing));
    propertiesRepository = module.get(getRepositoryToken(Property));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('returns all listings for a company', async () => {
      const listings = [mockListing()];
      listingsRepository.find!.mockResolvedValue(listings);

      const result = await service.findAll('company-uuid-1');

      expect(listingsRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'company-uuid-1' },
        }),
      );
      expect(result).toEqual(listings);
    });

    it('filters by propertyId when provided', async () => {
      listingsRepository.find!.mockResolvedValue([]);

      await service.findAll('company-uuid-1', 'property-uuid-1');

      expect(listingsRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: 'company-uuid-1', propertyId: 'property-uuid-1' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns listing when found', async () => {
      const listing = mockListing();
      listingsRepository.findOne!.mockResolvedValue(listing);

      const result = await service.findOne('listing-uuid-1', 'company-uuid-1');

      expect(result).toEqual(listing);
    });

    it('throws NotFoundException when not found', async () => {
      listingsRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.findOne('missing-id', 'company-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a listing in draft status', async () => {
      const dto = {
        propertyId: 'property-uuid-1',
        portal: PortalName.MERCADOLIBRE,
      };

      propertiesRepository.findOne!.mockResolvedValue(mockProperty());
      listingsRepository.findOne!.mockResolvedValue(null);

      const created = mockListing();
      listingsRepository.create!.mockReturnValue(created);
      listingsRepository.save!.mockResolvedValue(created);

      const result = await service.create('company-uuid-1', dto);

      expect(listingsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PortalListingStatus.DRAFT,
          portal: PortalName.MERCADOLIBRE,
        }),
      );
      expect(result).toEqual(created);
    });

    it('throws NotFoundException when property does not exist', async () => {
      propertiesRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.create('company-uuid-1', {
          propertyId: 'missing-id',
          portal: PortalName.MERCADOLIBRE,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when listing already exists', async () => {
      propertiesRepository.findOne!.mockResolvedValue(mockProperty());
      listingsRepository.findOne!.mockResolvedValue(mockListing());

      await expect(
        service.create('company-uuid-1', {
          propertyId: 'property-uuid-1',
          portal: PortalName.MERCADOLIBRE,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  it('rejects unsupported or disabled draft creation before persistence', async () => {
    await expect(
      service.create('company', {
        propertyId: 'property',
        portal: PortalName.ZONAPROP,
      }),
    ).rejects.toThrow('not configured');
    publications.assertEnabled.mockImplementation(() => {
      throw new Error('disabled');
    });
    await expect(
      service.create('company', {
        propertyId: 'property',
        portal: PortalName.MERCADOLIBRE,
      }),
    ).rejects.toThrow('disabled');
    expect(propertiesRepository.findOne).not.toHaveBeenCalled();
    expect(listingsRepository.save).not.toHaveBeenCalled();
  });
  it.each(['23505', 'XX000'])(
    'handles concurrent draft insertion errors (%s)',
    async (code) => {
      propertiesRepository.findOne!.mockResolvedValue(mockProperty());
      listingsRepository.findOne!.mockResolvedValue(null);
      listingsRepository.save!.mockRejectedValue(
        Object.assign(new Error('database failure'), { code }),
      );
      await expect(
        service.create('company', {
          propertyId: 'property',
          portal: PortalName.MERCADOLIBRE,
        }),
      ).rejects.toThrow(
        code === '23505' ? 'already exists' : 'database failure',
      );
    },
  );

  it('requires company scope before repository reads', async () => {
    await expect(service.findAll('')).rejects.toThrow('Company scope');
    await expect(service.findOne('listing', '')).rejects.toThrow(
      'Company scope',
    );
    await expect(
      service.create('', {
        propertyId: 'property',
        portal: PortalName.MERCADOLIBRE,
      }),
    ).rejects.toThrow('Company scope');
    await expect(service.syncAll('')).rejects.toThrow('Company scope');
    expect(listingsRepository.find).not.toHaveBeenCalled();
    expect(propertiesRepository.findOne).not.toHaveBeenCalled();
  });
  it.each(['publish', 'pause'] as const)(
    'enqueues %s without changing provider state before confirmation',
    async (operation) => {
      const listing = mockListing();
      listingsRepository.findOne!.mockResolvedValue(listing);
      expect(await service[operation](listing.id, listing.companyId)).toBe(
        listing,
      );
      expect(publications.enqueue).toHaveBeenCalledWith(
        listing.id,
        listing.companyId,
        operation,
      );
      expect(listingsRepository.update).not.toHaveBeenCalled();
    },
  );
  it('queues removal and updated data without direct provider calls', async () => {
    const listing = mockListing();
    listingsRepository.findOne!.mockResolvedValue(listing);
    await service.remove(listing.id, listing.companyId);
    await service.update(listing.id, listing.companyId, {
      item: { title: 'Updated' },
    });
    expect(publications.enqueue).toHaveBeenCalledWith(
      listing.id,
      listing.companyId,
      'remove',
    );
    expect(publications.enqueue).toHaveBeenCalledWith(
      listing.id,
      listing.companyId,
      'update',
      { item: { title: 'Updated' } },
    );
    expect(listingsRepository.update).not.toHaveBeenCalled();
  });
  it('queues company-scoped refreshes only for Mercado Libre', async () => {
    const listing = mockListing();
    listingsRepository.find!.mockResolvedValue([listing]);
    await expect(service.syncAll(listing.companyId)).resolves.toEqual([
      listing,
    ]);
    expect(listingsRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [
          {
            companyId: listing.companyId,
            portal: PortalName.MERCADOLIBRE,
            status: PortalListingStatus.PUBLISHED,
          },
          {
            companyId: listing.companyId,
            portal: PortalName.MERCADOLIBRE,
            status: PortalListingStatus.PAUSED,
          },
        ],
      }),
    );
    expect(publications.enqueue).toHaveBeenCalledWith(
      listing.id,
      listing.companyId,
      'refresh',
    );
    expect(listingsRepository.update).not.toHaveBeenCalled();
  });
  it('does not query listings when publication processing is disabled', async () => {
    publications.assertEnabled.mockImplementation(() => {
      throw new Error('disabled');
    });
    publications.enqueue.mockRejectedValue(new Error('disabled'));
    await expect(service.syncAll('company')).rejects.toThrow('disabled');
    await expect(service.publish('listing', 'company')).rejects.toThrow(
      'disabled',
    );
    expect(listingsRepository.find).not.toHaveBeenCalled();
    expect(listingsRepository.findOne).not.toHaveBeenCalled();
  });
});
