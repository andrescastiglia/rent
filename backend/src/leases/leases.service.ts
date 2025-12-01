import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lease, LeaseStatus } from './entities/lease.entity';
import { Unit, UnitStatus } from '../properties/entities/unit.entity';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';
import { LeaseFiltersDto } from './dto/lease-filters.dto';
import { PdfService } from './pdf.service';

@Injectable()
export class LeasesService {
  constructor(
    @InjectRepository(Lease)
    private leasesRepository: Repository<Lease>,
    @InjectRepository(Unit)
    private unitsRepository: Repository<Unit>,
    private pdfService: PdfService,
  ) {}

  async create(createLeaseDto: CreateLeaseDto): Promise<Lease> {
    // Validate dates
    const startDate = new Date(createLeaseDto.startDate);
    const endDate = new Date(createLeaseDto.endDate);

    if (endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    // Check if unit exists
    const unit = await this.unitsRepository.findOne({
      where: { id: createLeaseDto.unitId },
    });

    if (!unit) {
      throw new NotFoundException(`Unit with ID ${createLeaseDto.unitId} not found`);
    }

    // Create lease in draft status
    const lease = this.leasesRepository.create({
      ...createLeaseDto,
      status: LeaseStatus.DRAFT,
    });

    return this.leasesRepository.save(lease);
  }

  async findAll(filters: LeaseFiltersDto): Promise<{ data: Lease[]; total: number; page: number; limit: number }> {
    const { unitId, tenantId, status, propertyAddress, page = 1, limit = 10 } = filters;

    const query = this.leasesRepository
      .createQueryBuilder('lease')
      .leftJoinAndSelect('lease.unit', 'unit')
      .leftJoinAndSelect('unit.property', 'property')
      .leftJoinAndSelect('lease.tenant', 'tenant')
      .where('lease.deleted_at IS NULL');

    if (unitId) {
      query.andWhere('lease.unit_id = :unitId', { unitId });
    }

    if (tenantId) {
      query.andWhere('lease.tenant_id = :tenantId', { tenantId });
    }

    if (status) {
      query.andWhere('lease.status = :status', { status });
    }

    if (propertyAddress) {
      query.andWhere('property.address ILIKE :address', { address: `%${propertyAddress}%` });
    }

    query.skip((page - 1) * limit).take(limit);

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
      relations: ['unit', 'unit.property', 'tenant', 'amendments'],
    });

    if (!lease) {
      throw new NotFoundException(`Lease with ID ${id} not found`);
    }

    return lease;
  }

  async update(id: string, updateLeaseDto: UpdateLeaseDto): Promise<Lease> {
    const lease = await this.findOne(id);

    // Only allow updates to draft leases
    if (lease.status !== LeaseStatus.DRAFT) {
      throw new BadRequestException('Only draft leases can be updated. Use amendments for active leases.');
    }

    // Validate dates if provided
    if (updateLeaseDto.startDate || updateLeaseDto.endDate) {
      const startDate = new Date(updateLeaseDto.startDate || lease.startDate);
      const endDate = new Date(updateLeaseDto.endDate || lease.endDate);

      if (endDate <= startDate) {
        throw new BadRequestException('End date must be after start date');
      }
    }

    Object.assign(lease, updateLeaseDto);
    return this.leasesRepository.save(lease);
  }

  async activate(id: string, userId: string): Promise<Lease> {
    const lease = await this.findOne(id);

    if (lease.status !== LeaseStatus.DRAFT) {
      throw new BadRequestException('Only draft leases can be activated');
    }

    // Check if unit already has an active lease
    const existingActiveLease = await this.leasesRepository.findOne({
      where: { unitId: lease.unitId, status: LeaseStatus.ACTIVE },
    });

    if (existingActiveLease) {
      throw new ConflictException('Unit already has an active lease');
    }

    lease.status = LeaseStatus.ACTIVE;

    // Update unit status to occupied
    await this.unitsRepository.update(lease.unitId, { status: UnitStatus.OCCUPIED });

    const savedLease = await this.leasesRepository.save(lease);

    // Generate contract PDF
    try {
      await this.pdfService.generateContract(savedLease, userId);
    } catch (error) {
      console.error('Failed to generate contract PDF:', error);
      // Don't fail the activation if PDF generation fails
    }

    return savedLease;
  }

  async terminate(id: string, reason?: string): Promise<Lease> {
    const lease = await this.findOne(id);

    if (lease.status !== LeaseStatus.ACTIVE) {
      throw new BadRequestException('Only active leases can be terminated');
    }

    lease.status = LeaseStatus.TERMINATED;
    if (reason) {
      lease.notes = (lease.notes || '') + `\nTermination reason: ${reason}`;
    }

    // Update unit status to available
    await this.unitsRepository.update(lease.unitId, { status: UnitStatus.AVAILABLE });

    return this.leasesRepository.save(lease);
  }

  async renew(id: string, newTerms: Partial<CreateLeaseDto>): Promise<Lease> {
    const oldLease = await this.findOne(id);

    if (oldLease.status !== LeaseStatus.ACTIVE) {
      throw new BadRequestException('Only active leases can be renewed');
    }

    // Mark old lease as renewed
    oldLease.status = LeaseStatus.RENEWED;
    await this.leasesRepository.save(oldLease);

    // Create new lease with updated terms
    const newLease = this.leasesRepository.create({
      unitId: oldLease.unitId,
      tenantId: oldLease.tenantId,
      startDate: newTerms.startDate || oldLease.endDate,
      endDate: newTerms.endDate,
      rentAmount: newTerms.rentAmount || oldLease.rentAmount,
      deposit: newTerms.deposit || oldLease.deposit,
      currency: newTerms.currency || oldLease.currency,
      paymentFrequency: newTerms.paymentFrequency || oldLease.paymentFrequency,
      renewalTerms: newTerms.renewalTerms || oldLease.renewalTerms,
      status: LeaseStatus.DRAFT,
    });

    return this.leasesRepository.save(newLease);
  }

  async remove(id: string): Promise<void> {
    const lease = await this.findOne(id);

    if (lease.status === LeaseStatus.ACTIVE) {
      throw new BadRequestException('Cannot delete an active lease. Terminate it first.');
    }

    await this.leasesRepository.softDelete(id);
  }
}
