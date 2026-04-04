import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from '../properties/entities/property.entity';
import {
  PortalListing,
  PortalListingStatus,
  PortalName,
} from './entities/portal-listing.entity';
import { CreatePortalListingDto } from './dto/create-portal-listing.dto';

interface ListingPayload {
  title: string;
  description: string;
  price: number | null;
  currency: string;
  address: string;
  propertyType: string;
  portal: PortalName;
  listingData: Record<string, unknown>;
}

interface AdapterResult {
  externalId: string;
  externalUrl: string;
}

interface PortalAdapter {
  publish(payload: ListingPayload): Promise<AdapterResult>;
}

class MockPortalAdapter implements PortalAdapter {
  constructor(private readonly portal: PortalName) {}

  async publish(payload: ListingPayload): Promise<AdapterResult> {
    void payload;
    return {
      externalId: `mock-${Date.now()}`,
      externalUrl: `https://${this.portal}.com.ar/listings/mock`,
    };
  }
}

export class PortalAdapterFactory {
  static getAdapter(portal: PortalName): PortalAdapter {
    return new MockPortalAdapter(portal);
  }
}

@Injectable()
export class PortalsService {
  constructor(
    @InjectRepository(PortalListing)
    private readonly listingsRepository: Repository<PortalListing>,
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
  ) {}

  async findAll(
    companyId: string,
    propertyId?: string,
  ): Promise<PortalListing[]> {
    const where: Record<string, unknown> = { companyId };
    if (propertyId) {
      where['propertyId'] = propertyId;
    }
    return this.listingsRepository.find({
      where,
      relations: ['property'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, companyId: string): Promise<PortalListing> {
    const listing = await this.listingsRepository.findOne({
      where: { id, companyId },
      relations: ['property'],
    });

    if (!listing) {
      throw new NotFoundException(`Portal listing with ID ${id} not found`);
    }

    return listing;
  }

  async create(
    companyId: string,
    dto: CreatePortalListingDto,
  ): Promise<PortalListing> {
    const property = await this.propertiesRepository.findOne({
      where: { id: dto.propertyId, companyId },
    });

    if (!property) {
      throw new NotFoundException(
        `Property with ID ${dto.propertyId} not found`,
      );
    }

    const existing = await this.listingsRepository.findOne({
      where: { companyId, propertyId: dto.propertyId, portal: dto.portal },
    });

    if (existing) {
      throw new ConflictException(
        `A listing for this property on ${dto.portal} already exists`,
      );
    }

    const listing = this.listingsRepository.create({
      companyId,
      propertyId: dto.propertyId,
      portal: dto.portal,
      status: PortalListingStatus.DRAFT,
      listingData: dto.listingData ?? {},
    });

    return this.listingsRepository.save(listing);
  }

  async publish(id: string, companyId: string): Promise<PortalListing> {
    const listing = await this.findOne(id, companyId);

    const property = await this.propertiesRepository.findOne({
      where: { id: listing.propertyId, companyId },
    });

    if (!property) {
      throw new NotFoundException(
        `Property with ID ${listing.propertyId} not found`,
      );
    }

    const addressParts = [
      property.addressStreet,
      property.addressNumber,
      property.addressFloor ? `Piso ${property.addressFloor}` : null,
      property.addressApartment ? `Dto ${property.addressApartment}` : null,
      property.addressCity,
      property.addressState,
    ].filter(Boolean);

    const payload: ListingPayload = {
      title: property.name,
      description: property.description ?? '',
      price: property.rentPrice ? Number(property.rentPrice) : null,
      currency: 'ARS',
      address: addressParts.join(', '),
      propertyType: property.propertyType,
      portal: listing.portal,
      listingData: listing.listingData,
    };

    const adapter = PortalAdapterFactory.getAdapter(listing.portal);
    const result = await adapter.publish(payload);

    const now = new Date();
    await this.listingsRepository.update(id, {
      externalId: result.externalId,
      externalUrl: result.externalUrl,
      publishedAt: now,
      lastSyncedAt: now,
      status: PortalListingStatus.PUBLISHED,
      errorMessage: null,
    });

    return this.findOne(id, companyId);
  }

  async pause(id: string, companyId: string): Promise<PortalListing> {
    await this.findOne(id, companyId);

    await this.listingsRepository.update(id, {
      status: PortalListingStatus.PAUSED,
    });

    return this.findOne(id, companyId);
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.findOne(id, companyId);

    await this.listingsRepository.update(id, {
      status: PortalListingStatus.REMOVED,
    });
  }

  async syncAll(companyId: string): Promise<PortalListing[]> {
    const published = await this.listingsRepository.find({
      where: { companyId, status: PortalListingStatus.PUBLISHED },
      relations: ['property'],
    });

    const results: PortalListing[] = [];

    for (const listing of published) {
      const property = listing.property;

      const addressParts = [
        property.addressStreet,
        property.addressNumber,
        property.addressFloor ? `Piso ${property.addressFloor}` : null,
        property.addressApartment ? `Dto ${property.addressApartment}` : null,
        property.addressCity,
        property.addressState,
      ].filter(Boolean);

      const payload: ListingPayload = {
        title: property.name,
        description: property.description ?? '',
        price: property.rentPrice ? Number(property.rentPrice) : null,
        currency: 'ARS',
        address: addressParts.join(', '),
        propertyType: property.propertyType,
        portal: listing.portal,
        listingData: listing.listingData,
      };

      try {
        const adapter = PortalAdapterFactory.getAdapter(listing.portal);
        await adapter.publish(payload);

        await this.listingsRepository.update(listing.id, {
          lastSyncedAt: new Date(),
          errorMessage: null,
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Unknown sync error';
        await this.listingsRepository.update(listing.id, {
          status: PortalListingStatus.ERROR,
          errorMessage: message,
        });
      }

      const refreshed = await this.listingsRepository.findOne({
        where: { id: listing.id },
        relations: ['property'],
      });
      if (refreshed) results.push(refreshed);
    }

    return results;
  }
}
