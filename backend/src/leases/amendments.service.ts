import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LeaseAmendment,
  AmendmentStatus,
} from './entities/lease-amendment.entity';
import { Lease, LeaseStatus } from './entities/lease.entity';
import { CreateAmendmentDto } from './dto/create-amendment.dto';

@Injectable()
export class AmendmentsService {
  constructor(
    @InjectRepository(LeaseAmendment)
    private amendmentsRepository: Repository<LeaseAmendment>,
    @InjectRepository(Lease)
    private leasesRepository: Repository<Lease>,
  ) {}

  async create(
    createAmendmentDto: CreateAmendmentDto,
    userId: string,
  ): Promise<LeaseAmendment> {
    // Check if lease exists and is active
    const lease = await this.leasesRepository.findOne({
      where: { id: createAmendmentDto.leaseId },
    });

    if (!lease) {
      throw new NotFoundException(
        `Lease with ID ${createAmendmentDto.leaseId} not found`,
      );
    }

    if (lease.status !== LeaseStatus.ACTIVE) {
      throw new BadRequestException(
        'Amendments can only be created for active leases',
      );
    }

    const amendment = this.amendmentsRepository.create({
      ...createAmendmentDto,
      status: AmendmentStatus.PENDING,
    });

    return this.amendmentsRepository.save(amendment);
  }

  async findByLease(leaseId: string): Promise<LeaseAmendment[]> {
    return this.amendmentsRepository.find({
      where: { leaseId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<LeaseAmendment> {
    const amendment = await this.amendmentsRepository.findOne({
      where: { id },
      relations: ['lease'],
    });

    if (!amendment) {
      throw new NotFoundException(`Amendment with ID ${id} not found`);
    }

    return amendment;
  }

  async approve(id: string, userId: string): Promise<LeaseAmendment> {
    const amendment = await this.findOne(id);

    if (amendment.status !== AmendmentStatus.PENDING) {
      throw new BadRequestException('Only pending amendments can be approved');
    }

    amendment.status = AmendmentStatus.APPROVED;
    amendment.approvedBy = userId;
    amendment.approvedAt = new Date();

    return this.amendmentsRepository.save(amendment);
  }

  async reject(id: string, userId: string): Promise<LeaseAmendment> {
    const amendment = await this.findOne(id);

    if (amendment.status !== AmendmentStatus.PENDING) {
      throw new BadRequestException('Only pending amendments can be rejected');
    }

    amendment.status = AmendmentStatus.REJECTED;
    amendment.approvedBy = userId;
    amendment.approvedAt = new Date();

    return this.amendmentsRepository.save(amendment);
  }
}
