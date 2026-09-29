import { PortalPublicationOutboxService } from './portal-publication-outbox.service';
import {
  ConflictException,
  BadRequestException,
  ServiceUnavailableException,
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

@Injectable()
export class PortalsService {
  constructor(
    @InjectRepository(PortalListing)
    private readonly listingsRepository: Repository<PortalListing>,
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
    private readonly publications: PortalPublicationOutboxService,
  ) {}

  async findAll(
    companyId: string,
    propertyId?: string,
  ): Promise<PortalListing[]> {
    this.assertCompany(companyId);
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
    this.assertCompany(companyId);
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
    this.publications.assertEnabled();
    this.assertCompany(companyId);
    if (dto.portal !== PortalName.MERCADOLIBRE)
      throw new ServiceUnavailableException('This portal is not configured');
    const listingData = this.publications.validateListingData(
      dto.listingData ?? {},
    );
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
      listingData,
    });

    try {
      return await this.listingsRepository.save(listing);
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException(
          'A listing for this property already exists',
        );
      throw error;
    }
  }

  async publish(id: string, companyId: string): Promise<PortalListing> {
    await this.publications.enqueue(id, companyId, 'publish');
    return this.findOne(id, companyId);
  }

  async update(
    id: string,
    companyId: string,
    listingData: Record<string, unknown>,
  ): Promise<PortalListing> {
    await this.publications.enqueue(id, companyId, 'update', listingData);
    return this.findOne(id, companyId);
  }

  async pause(id: string, companyId: string): Promise<PortalListing> {
    await this.publications.enqueue(id, companyId, 'pause');
    return this.findOne(id, companyId);
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.publications.enqueue(id, companyId, 'remove');
  }

  async syncAll(companyId: string): Promise<PortalListing[]> {
    this.publications.assertEnabled();
    this.assertCompany(companyId);
    const listings = await this.listingsRepository.find({
      where: [
        {
          companyId,
          portal: PortalName.MERCADOLIBRE,
          status: PortalListingStatus.PUBLISHED,
        },
        {
          companyId,
          portal: PortalName.MERCADOLIBRE,
          status: PortalListingStatus.PAUSED,
        },
      ],
      relations: ['property'],
      order: { createdAt: 'DESC' },
    });
    for (const listing of listings)
      await this.publications.enqueue(listing.id, companyId, 'refresh');
    return listings;
  }
  private assertCompany(companyId: string): void {
    if (!companyId) throw new BadRequestException('Company scope required');
  }
}
