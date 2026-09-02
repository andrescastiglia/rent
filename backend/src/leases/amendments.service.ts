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
import { UserRole } from '../users/entities/user.entity';

type AmendmentActor = {
  id: string;
  companyId: string;
  role: UserRole;
};

@Injectable()
export class AmendmentsService {
  constructor(
    @InjectRepository(LeaseAmendment)
    private readonly amendmentsRepository: Repository<LeaseAmendment>,
    @InjectRepository(Lease)
    private readonly leasesRepository: Repository<Lease>,
  ) {}

  async create(
    createAmendmentDto: CreateAmendmentDto,
    user: AmendmentActor,
  ): Promise<LeaseAmendment> {
    const lease = await this.findLeaseScoped(createAmendmentDto.leaseId, user);

    if (lease.status !== LeaseStatus.ACTIVE) {
      throw new BadRequestException(
        'Amendments can only be created for active leases',
      );
    }

    const { companyId: _companyId, ...amendmentDto } = createAmendmentDto;
    const amendment = this.amendmentsRepository.create({
      ...amendmentDto,
      status: AmendmentStatus.DRAFT,
      amendmentNumber: 1, // This should be calculated based on existing amendments
    });

    return this.amendmentsRepository.save(amendment);
  }

  async findByLease(
    leaseId: string,
    user: AmendmentActor,
  ): Promise<LeaseAmendment[]> {
    await this.findLeaseScoped(leaseId, user);
    return this.amendmentsRepository.find({
      where: { leaseId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, user: AmendmentActor): Promise<LeaseAmendment> {
    const amendment = await this.amendmentsRepository.findOne({
      where: { id },
      relations: ['lease'],
    });

    if (!amendment) {
      throw new NotFoundException(`Amendment with ID ${id} not found`);
    }

    await this.findLeaseScoped(amendment.leaseId, user);

    return amendment;
  }

  async approve(id: string, user: AmendmentActor): Promise<LeaseAmendment> {
    const amendment = await this.findOne(id, user);

    if (amendment.status !== AmendmentStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Only pending amendments can be approved');
    }

    amendment.status = AmendmentStatus.APPROVED;
    amendment.approvedBy = user.id;
    amendment.approvedAt = new Date();

    return this.amendmentsRepository.save(amendment);
  }

  async reject(id: string, user: AmendmentActor): Promise<LeaseAmendment> {
    const amendment = await this.findOne(id, user);

    if (amendment.status !== AmendmentStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Only pending amendments can be rejected');
    }

    amendment.status = AmendmentStatus.REJECTED;
    amendment.approvedBy = user.id;
    amendment.approvedAt = new Date();

    return this.amendmentsRepository.save(amendment);
  }

  private async findLeaseScoped(
    leaseId: string,
    user: AmendmentActor,
  ): Promise<Lease> {
    const query = this.leasesRepository
      .createQueryBuilder('lease')
      .leftJoin('lease.property', 'property')
      .leftJoin('property.owner', 'owner')
      .leftJoin('lease.tenant', 'tenant')
      .leftJoin('lease.buyer', 'buyer')
      .where('lease.id = :leaseId', { leaseId })
      .andWhere('lease.company_id = :companyId', { companyId: user.companyId })
      .andWhere('lease.deleted_at IS NULL');

    if (user.role === UserRole.OWNER) {
      query.andWhere('owner.user_id = :userId', { userId: user.id });
    } else if (user.role === UserRole.TENANT) {
      query.andWhere('tenant.user_id = :userId', { userId: user.id });
    } else if (user.role === UserRole.BUYER) {
      query.andWhere('buyer.user_id = :userId', { userId: user.id });
    }

    const lease = await query.getOne();
    if (!lease) {
      throw new NotFoundException(`Lease with ID ${leaseId} not found`);
    }
    return lease;
  }
}
