import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Property } from '../properties/entities/property.entity';
import { Lease, LeaseStatus } from '../leases/entities/lease.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
    @InjectRepository(Lease)
    private readonly leasesRepository: Repository<Lease>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async getStats(companyId: string): Promise<DashboardStatsDto> {
    // Count properties for the company
    const totalProperties = await this.propertiesRepository.count({
      where: { companyId, deletedAt: IsNull() },
    });

    // Count tenants for the company
    const totalTenants = await this.usersRepository.count({
      where: { 
        companyId, 
        role: UserRole.TENANT,
        deletedAt: IsNull(),
      },
    });

    // Count active leases and calculate monthly income
    const activeLeasesList = await this.leasesRepository
      .createQueryBuilder('lease')
      .innerJoin('lease.unit', 'unit')
      .innerJoin('unit.property', 'property')
      .leftJoinAndSelect('lease.currency', 'currency')
      .where('property.company_id = :companyId', { companyId })
      .andWhere('lease.status = :status', { status: LeaseStatus.ACTIVE })
      .andWhere('lease.deleted_at IS NULL')
      .getMany();

    const activeLeases = activeLeasesList.length;

    // Calculate monthly income (sum of rent amounts from active leases)
    const monthlyIncome = activeLeasesList.reduce((sum, lease) => {
      return sum + Number(lease.rentAmount);
    }, 0);

    // Get the most common currency or default to ARS
    const currencyCode = activeLeasesList.length > 0 
      ? activeLeasesList[0].currencyCode || 'ARS'
      : 'ARS';

    return {
      totalProperties,
      totalTenants,
      activeLeases,
      monthlyIncome,
      currencyCode,
    };
  }
}
