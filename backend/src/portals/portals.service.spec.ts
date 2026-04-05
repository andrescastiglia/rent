import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PortalsService, PortalAdapterFactory } from './portals.service';
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
    portal: PortalName.ZONAPROP,
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalsService,
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
        portal: PortalName.ZONAPROP,
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
          portal: PortalName.ZONAPROP,
        }),
      );
      expect(result).toEqual(created);
    });

    it('throws NotFoundException when property does not exist', async () => {
      propertiesRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.create('company-uuid-1', {
          propertyId: 'missing-id',
          portal: PortalName.ZONAPROP,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when listing already exists', async () => {
      propertiesRepository.findOne!.mockResolvedValue(mockProperty());
      listingsRepository.findOne!.mockResolvedValue(mockListing());

      await expect(
        service.create('company-uuid-1', {
          propertyId: 'property-uuid-1',
          portal: PortalName.ZONAPROP,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('publish', () => {
    it('calls adapter and sets published status', async () => {
      const listing = mockListing();
      listingsRepository
        .findOne!.mockResolvedValueOnce(listing)
        .mockResolvedValueOnce(
          mockListing({ status: PortalListingStatus.PUBLISHED }),
        );
      propertiesRepository.findOne!.mockResolvedValue(mockProperty());

      const result = await service.publish('listing-uuid-1', 'company-uuid-1');

      expect(listingsRepository.update).toHaveBeenCalledWith(
        'listing-uuid-1',
        expect.objectContaining({
          status: PortalListingStatus.PUBLISHED,
          externalId: expect.stringContaining('mock-'),
          externalUrl: expect.stringContaining('zonaprop.com.ar'),
        }),
      );
      expect(result.status).toBe(PortalListingStatus.PUBLISHED);
    });

    it('throws NotFoundException when listing not found', async () => {
      listingsRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.publish('missing-id', 'company-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('pause', () => {
    it('sets status to paused', async () => {
      const listing = mockListing({ status: PortalListingStatus.PUBLISHED });
      listingsRepository
        .findOne!.mockResolvedValueOnce(listing)
        .mockResolvedValueOnce(
          mockListing({ status: PortalListingStatus.PAUSED }),
        );

      const result = await service.pause('listing-uuid-1', 'company-uuid-1');

      expect(listingsRepository.update).toHaveBeenCalledWith('listing-uuid-1', {
        status: PortalListingStatus.PAUSED,
      });
      expect(result.status).toBe(PortalListingStatus.PAUSED);
    });
  });

  describe('remove', () => {
    it('sets status to removed', async () => {
      const listing = mockListing();
      listingsRepository.findOne!.mockResolvedValue(listing);

      await service.remove('listing-uuid-1', 'company-uuid-1');

      expect(listingsRepository.update).toHaveBeenCalledWith('listing-uuid-1', {
        status: PortalListingStatus.REMOVED,
      });
    });

    it('throws NotFoundException when listing not found', async () => {
      listingsRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.remove('missing-id', 'company-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('syncAll', () => {
    it('refreshes all published listings', async () => {
      const publishedListing = mockListing({
        status: PortalListingStatus.PUBLISHED,
      });
      listingsRepository.find!.mockResolvedValue([publishedListing]);
      listingsRepository.findOne!.mockResolvedValue(publishedListing);

      const results = await service.syncAll('company-uuid-1');

      expect(listingsRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: 'company-uuid-1',
            status: PortalListingStatus.PUBLISHED,
          },
        }),
      );
      expect(listingsRepository.update).toHaveBeenCalledWith(
        publishedListing.id,
        expect.objectContaining({ lastSyncedAt: expect.any(Date) }),
      );
      expect(results).toHaveLength(1);
    });

    it('marks listing as error when adapter fails', async () => {
      const publishedListing = mockListing({
        status: PortalListingStatus.PUBLISHED,
      });
      listingsRepository.find!.mockResolvedValue([publishedListing]);
      listingsRepository.findOne!.mockResolvedValue(publishedListing);

      jest.spyOn(PortalAdapterFactory, 'getAdapter').mockReturnValueOnce({
        publish: jest.fn().mockRejectedValue(new Error('Portal unavailable')),
      });

      await service.syncAll('company-uuid-1');

      expect(listingsRepository.update).toHaveBeenCalledWith(
        publishedListing.id,
        expect.objectContaining({
          status: PortalListingStatus.ERROR,
          errorMessage: 'Portal unavailable',
        }),
      );
    });
  });
});
