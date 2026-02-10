import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  ContractType,
  LateFeeType,
  Lease,
  LeaseStatus,
} from './entities/lease.entity';
import {
  Property,
  PropertyOperationState,
} from '../properties/entities/property.entity';
import { InterestedProfile } from '../interested/entities/interested-profile.entity';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { LeaseFiltersDto } from './dto/lease-filters.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';
import { PdfService } from './pdf.service';

@Injectable()
export class LeasesService {
  constructor(
    @InjectRepository(Lease)
    private readonly leasesRepository: Repository<Lease>,
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
    @InjectRepository(InterestedProfile)
    private readonly interestedProfilesRepository: Repository<InterestedProfile>,
    private readonly pdfService: PdfService,
  ) {}

  async create(createLeaseDto: CreateLeaseDto): Promise<Lease> {
    const contractType = createLeaseDto.contractType ?? ContractType.RENTAL;

    const property = await this.propertiesRepository.findOne({
      where: { id: createLeaseDto.propertyId, deletedAt: IsNull() },
    });
    if (!property) {
      throw new NotFoundException(
        `Property with ID ${createLeaseDto.propertyId} not found`,
      );
    }

    if (contractType === ContractType.RENTAL) {
      this.validateRentalCreate(createLeaseDto);
      const existingActiveLease = await this.leasesRepository.findOne({
        where: {
          propertyId: property.id,
          contractType: ContractType.RENTAL,
          status: LeaseStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });
      if (existingActiveLease) {
        throw new ConflictException('Property already has an active contract');
      }
    } else {
      await this.validateSaleCreate(createLeaseDto);
    }

    const lease = this.leasesRepository.create({
      ...createLeaseDto,
      contractType,
      propertyId: property.id,
      ownerId: createLeaseDto.ownerId || property.ownerId,
      status: LeaseStatus.DRAFT,
      tenantId:
        contractType === ContractType.RENTAL
          ? (createLeaseDto.tenantId ?? null)
          : null,
      buyerProfileId:
        contractType === ContractType.SALE
          ? (createLeaseDto.buyerProfileId ?? null)
          : null,
      monthlyRent:
        contractType === ContractType.RENTAL
          ? Number(createLeaseDto.monthlyRent ?? 0)
          : null,
      startDate:
        contractType === ContractType.RENTAL
          ? createLeaseDto.startDate
            ? new Date(createLeaseDto.startDate)
            : null
          : null,
      endDate:
        contractType === ContractType.RENTAL
          ? createLeaseDto.endDate
            ? new Date(createLeaseDto.endDate)
            : null
          : null,
      fiscalValue:
        contractType === ContractType.SALE
          ? Number(createLeaseDto.fiscalValue ?? 0)
          : null,
      lateFeeType:
        contractType === ContractType.RENTAL
          ? createLeaseDto.lateFeeType || LateFeeType.NONE
          : LateFeeType.NONE,
      lateFeeValue:
        contractType === ContractType.RENTAL
          ? Number(createLeaseDto.lateFeeValue ?? 0)
          : 0,
      adjustmentValue:
        contractType === ContractType.RENTAL
          ? createLeaseDto.adjustmentValue
          : 0,
    });

    return this.leasesRepository.save(lease);
  }

  async findAll(
    filters: LeaseFiltersDto,
  ): Promise<{ data: Lease[]; total: number; page: number; limit: number }> {
    const {
      propertyId,
      tenantId,
      buyerProfileId,
      status,
      contractType,
      propertyAddress,
      page = 1,
      limit = 10,
    } = filters;

    const query = this.leasesRepository
      .createQueryBuilder('lease')
      .leftJoinAndSelect('lease.property', 'property')
      .leftJoinAndSelect('lease.tenant', 'tenant')
      .leftJoinAndSelect('lease.buyerProfile', 'buyerProfile')
      .where('lease.deleted_at IS NULL');

    if (propertyId) {
      query.andWhere('lease.property_id = :propertyId', { propertyId });
    }

    if (tenantId) {
      query.andWhere('lease.tenant_id = :tenantId', { tenantId });
    }

    if (buyerProfileId) {
      query.andWhere('lease.buyer_profile_id = :buyerProfileId', {
        buyerProfileId,
      });
    }

    if (status) {
      query.andWhere('lease.status = :status', { status });
    }

    if (contractType) {
      query.andWhere('lease.contract_type = :contractType', { contractType });
    }

    if (propertyAddress) {
      query.andWhere(
        `(
          property.address_street ILIKE :address OR
          property.address_city ILIKE :address OR
          property.address_state ILIKE :address OR
          property.address_postal_code ILIKE :address
        )`,
        {
          address: `%${propertyAddress}%`,
        },
      );
    }

    query
      .orderBy('lease.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<Lease> {
    const lease = await this.leasesRepository.findOne({
      where: { id },
      relations: [
        'property',
        'property.owner',
        'property.owner.user',
        'tenant',
        'tenant.user',
        'buyerProfile',
        'amendments',
      ],
    });

    if (!lease) {
      throw new NotFoundException(`Lease with ID ${id} not found`);
    }

    return lease;
  }

  async update(id: string, updateLeaseDto: UpdateLeaseDto): Promise<Lease> {
    const lease = await this.findOne(id);

    if (lease.status !== LeaseStatus.DRAFT) {
      throw new BadRequestException(
        'Only draft contracts can be updated. Use amendments for active contracts.',
      );
    }

    const effectiveType = updateLeaseDto.contractType ?? lease.contractType;
    if (effectiveType === ContractType.RENTAL) {
      this.validateRentalDates(
        updateLeaseDto.startDate ?? lease.startDate?.toISOString(),
        updateLeaseDto.endDate ?? lease.endDate?.toISOString(),
      );
    }

    if (updateLeaseDto.propertyId) {
      const property = await this.propertiesRepository.findOne({
        where: { id: updateLeaseDto.propertyId, deletedAt: IsNull() },
      });
      if (!property) {
        throw new NotFoundException('Property not found');
      }
      lease.propertyId = property.id;
      if (!updateLeaseDto.ownerId) {
        lease.ownerId = property.ownerId;
      }
    }

    Object.assign(lease, {
      ...updateLeaseDto,
      startDate:
        updateLeaseDto.startDate !== undefined
          ? updateLeaseDto.startDate
            ? new Date(updateLeaseDto.startDate)
            : null
          : lease.startDate,
      endDate:
        updateLeaseDto.endDate !== undefined
          ? updateLeaseDto.endDate
            ? new Date(updateLeaseDto.endDate)
            : null
          : lease.endDate,
    });

    if (effectiveType === ContractType.SALE) {
      lease.tenantId = null;
      lease.monthlyRent = null;
      lease.startDate = null;
      lease.endDate = null;
      lease.lateFeeType = LateFeeType.NONE;
      lease.lateFeeValue = 0;
      lease.adjustmentValue = 0;
    }

    return this.leasesRepository.save(lease);
  }

  async activate(id: string, userId: string): Promise<Lease> {
    const lease = await this.findOne(id);

    if (lease.status !== LeaseStatus.DRAFT) {
      throw new BadRequestException('Only draft contracts can be activated');
    }

    if (lease.contractType === ContractType.RENTAL && lease.propertyId) {
      const existingActiveLease = await this.leasesRepository.findOne({
        where: {
          propertyId: lease.propertyId,
          contractType: ContractType.RENTAL,
          status: LeaseStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });

      if (existingActiveLease && existingActiveLease.id !== lease.id) {
        throw new ConflictException('Property already has an active contract');
      }
    }

    lease.status = LeaseStatus.ACTIVE;

    if (lease.contractType === ContractType.RENTAL && lease.propertyId) {
      await this.propertiesRepository.update(lease.propertyId, {
        operationState: PropertyOperationState.RENTED,
      });
    }

    if (lease.contractType === ContractType.SALE && lease.propertyId) {
      await this.propertiesRepository.update(lease.propertyId, {
        operationState: PropertyOperationState.SOLD,
      });
    }

    const savedLease = await this.leasesRepository.save(lease);

    try {
      const document = await this.pdfService.generateContract(
        savedLease,
        userId,
      );
      savedLease.contractPdfUrl = document.fileUrl;
      return this.leasesRepository.save(savedLease);
    } catch (error) {
      console.error('Failed to generate contract PDF:', error);
      return savedLease;
    }
  }

  async terminate(id: string, reason?: string): Promise<Lease> {
    const lease = await this.findOne(id);

    if (lease.status !== LeaseStatus.ACTIVE) {
      throw new BadRequestException('Only active contracts can be finalized');
    }

    lease.status = LeaseStatus.FINALIZED;
    if (reason) {
      lease.notes = (lease.notes || '') + `\nFinalization reason: ${reason}`;
    }

    if (lease.contractType === ContractType.RENTAL && lease.propertyId) {
      await this.propertiesRepository.update(lease.propertyId, {
        operationState: PropertyOperationState.AVAILABLE,
      });
    }

    return this.leasesRepository.save(lease);
  }

  async renew(id: string, newTerms: Partial<CreateLeaseDto>): Promise<Lease> {
    const oldLease = await this.findOne(id);

    if (oldLease.status !== LeaseStatus.ACTIVE) {
      throw new BadRequestException('Only active contracts can be renewed');
    }

    oldLease.status = LeaseStatus.FINALIZED;
    await this.leasesRepository.save(oldLease);

    const payload: CreateLeaseDto = {
      companyId: oldLease.companyId,
      propertyId: oldLease.propertyId as string,
      tenantId: oldLease.tenantId ?? undefined,
      buyerProfileId: oldLease.buyerProfileId ?? undefined,
      ownerId: oldLease.ownerId,
      contractType: oldLease.contractType,
      startDate:
        newTerms.startDate ||
        (oldLease.endDate ? oldLease.endDate.toISOString().slice(0, 10) : ''),
      endDate: newTerms.endDate,
      monthlyRent: newTerms.monthlyRent ?? Number(oldLease.monthlyRent ?? 0),
      fiscalValue: newTerms.fiscalValue ?? Number(oldLease.fiscalValue ?? 0),
      currency: newTerms.currency || oldLease.currency,
      paymentFrequency: newTerms.paymentFrequency || oldLease.paymentFrequency,
      paymentDueDay: newTerms.paymentDueDay || oldLease.paymentDueDay,
      billingFrequency: newTerms.billingFrequency || oldLease.billingFrequency,
      billingDay: newTerms.billingDay || oldLease.billingDay,
      lateFeeType: newTerms.lateFeeType || oldLease.lateFeeType,
      lateFeeValue: newTerms.lateFeeValue ?? oldLease.lateFeeValue,
      lateFeeGraceDays: newTerms.lateFeeGraceDays ?? oldLease.lateFeeGraceDays,
      lateFeeMax: newTerms.lateFeeMax ?? oldLease.lateFeeMax,
      autoGenerateInvoices:
        newTerms.autoGenerateInvoices ?? oldLease.autoGenerateInvoices,
      adjustmentType: newTerms.adjustmentType || oldLease.adjustmentType,
      adjustmentValue: newTerms.adjustmentValue ?? oldLease.adjustmentValue,
      adjustmentFrequencyMonths:
        newTerms.adjustmentFrequencyMonths ??
        oldLease.adjustmentFrequencyMonths,
      inflationIndexType:
        newTerms.inflationIndexType || oldLease.inflationIndexType,
      increaseClauseType:
        newTerms.increaseClauseType || oldLease.increaseClauseType,
      increaseClauseValue:
        newTerms.increaseClauseValue ?? oldLease.increaseClauseValue,
      termsAndConditions:
        newTerms.termsAndConditions || oldLease.termsAndConditions,
      specialClauses: newTerms.specialClauses || oldLease.specialClauses,
      notes: newTerms.notes || oldLease.notes,
    };

    return this.create(payload);
  }

  async remove(id: string): Promise<void> {
    const lease = await this.findOne(id);

    if (lease.status === LeaseStatus.ACTIVE) {
      throw new BadRequestException(
        'Cannot delete an active contract. Finalize it first.',
      );
    }

    await this.leasesRepository.softDelete(id);
  }

  private validateRentalDates(startDate?: string, endDate?: string): void {
    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Rental contracts require startDate and endDate',
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid contract dates');
    }
    if (end <= start) {
      throw new BadRequestException('End date must be after start date');
    }
  }

  private validateRentalCreate(dto: CreateLeaseDto): void {
    if (!dto.tenantId) {
      throw new BadRequestException('Rental contracts require tenantId');
    }
    if (dto.monthlyRent === undefined || dto.monthlyRent === null) {
      throw new BadRequestException('Rental contracts require monthlyRent');
    }
    this.validateRentalDates(dto.startDate, dto.endDate);
  }

  private async validateSaleCreate(dto: CreateLeaseDto): Promise<void> {
    if (!dto.buyerProfileId) {
      throw new BadRequestException('Sale contracts require buyerProfileId');
    }
    if (dto.fiscalValue === undefined || dto.fiscalValue === null) {
      throw new BadRequestException('Sale contracts require fiscalValue');
    }

    const buyer = await this.interestedProfilesRepository.findOne({
      where: { id: dto.buyerProfileId, deletedAt: IsNull() },
    });
    if (!buyer) {
      throw new NotFoundException('Buyer profile not found');
    }
  }
}
