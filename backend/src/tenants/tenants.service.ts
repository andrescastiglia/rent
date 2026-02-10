import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantFiltersDto } from './dto/tenant-filters.dto';
import { Lease } from '../leases/entities/lease.entity';
import { Tenant } from './entities/tenant.entity';
import {
  TenantActivity,
  TenantActivityStatus,
} from './entities/tenant-activity.entity';
import { CreateTenantActivityDto } from './dto/create-tenant-activity.dto';
import { UpdateTenantActivityDto } from './dto/update-tenant-activity.dto';

interface UserContext {
  id: string;
  companyId: string;
}

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private tenantsRepository: Repository<Tenant>,
    @InjectRepository(TenantActivity)
    private tenantActivitiesRepository: Repository<TenantActivity>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Lease)
    private leasesRepository: Repository<Lease>,
  ) {}

  async create(createTenantDto: CreateTenantDto): Promise<User> {
    // Check if DNI already exists
    const existingTenant = await this.usersRepository
      .createQueryBuilder('user')
      .innerJoin('tenants', 'tenant', 'tenant.user_id = user.id')
      .where('tenant.dni = :dni', { dni: createTenantDto.dni })
      .getOne();

    if (existingTenant) {
      throw new ConflictException('A tenant with this DNI already exists');
    }

    // Check if email already exists
    const existingUser = await this.usersRepository.findOne({
      where: { email: createTenantDto.email },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    // Hash password
    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(createTenantDto.password, salt);

    // Create user with tenant role
    const user = this.usersRepository.create({
      email: createTenantDto.email,
      passwordHash,
      firstName: createTenantDto.firstName,
      lastName: createTenantDto.lastName,
      phone: createTenantDto.phone,
      role: UserRole.TENANT,
      isActive: true,
    });

    const savedUser = await this.usersRepository.save(user);

    // Create tenant record (using raw query since we don't have Tenant entity in TypeORM)
    await this.usersRepository.query(
      `INSERT INTO tenants (user_id, company_id, dni, emergency_contact_name, emergency_contact_phone) VALUES ($1, $2, $3, $4, $5)`,
      [
        savedUser.id,
        createTenantDto.companyId,
        createTenantDto.dni,
        createTenantDto.emergencyContact,
        createTenantDto.emergencyPhone,
      ],
    );

    return savedUser;
  }

  async findAll(
    filters: TenantFiltersDto,
  ): Promise<{ data: User[]; total: number; page: number; limit: number }> {
    const { name, dni, email, page = 1, limit = 10 } = filters;

    const query = this.usersRepository
      .createQueryBuilder('user')
      .innerJoin('tenants', 'tenant', 'tenant.user_id = user.id')
      .where('user.role = :role', { role: UserRole.TENANT })
      .andWhere('user.deleted_at IS NULL');

    if (name) {
      query.andWhere(
        '(user.first_name ILIKE :name OR user.last_name ILIKE :name)',
        { name: `%${name}%` },
      );
    }

    if (dni) {
      query.andWhere('tenant.dni ILIKE :dni', { dni: `%${dni}%` });
    }

    if (email) {
      query.andWhere('user.email ILIKE :email', { email: `%${email}%` });
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

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id, role: UserRole.TENANT },
    });

    if (!user) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    return user;
  }

  async update(id: string, updateTenantDto: UpdateTenantDto): Promise<User> {
    const user = await this.findOne(id);

    // Update user fields
    if (updateTenantDto.firstName) user.firstName = updateTenantDto.firstName;
    if (updateTenantDto.lastName) user.lastName = updateTenantDto.lastName;
    if (updateTenantDto.phone) user.phone = updateTenantDto.phone;

    await this.usersRepository.save(user);

    // Update tenant fields if provided
    if (
      updateTenantDto.dni ||
      updateTenantDto.emergencyContact ||
      updateTenantDto.emergencyPhone
    ) {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updateTenantDto.dni) {
        updates.push(`dni = $${paramIndex++}`);
        values.push(updateTenantDto.dni);
      }
      if (updateTenantDto.emergencyContact) {
        updates.push(`emergency_contact_name = $${paramIndex++}`);
        values.push(updateTenantDto.emergencyContact);
      }
      if (updateTenantDto.emergencyPhone) {
        updates.push(`emergency_contact_phone = $${paramIndex++}`);
        values.push(updateTenantDto.emergencyPhone);
      }

      if (updates.length > 0) {
        values.push(id);
        await this.usersRepository.query(
          `UPDATE tenants SET ${updates.join(', ')} WHERE user_id = $${paramIndex}`,
          values,
        );
      }
    }

    return user;
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id); // Validates tenant exists
    await this.usersRepository.softDelete(id);
  }

  async getLeaseHistory(tenantId: string): Promise<Lease[]> {
    return this.leasesRepository.find({
      where: { tenantId },
      relations: ['property'],
      order: { startDate: 'DESC' },
    });
  }

  private async findTenantByUserId(
    userId: string,
    companyId: string,
  ): Promise<Tenant> {
    const tenant = await this.tenantsRepository.findOne({
      where: { userId, companyId, deletedAt: IsNull() },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${userId} not found`);
    }

    return tenant;
  }

  async listActivities(
    tenantUserId: string,
    companyId: string,
  ): Promise<TenantActivity[]> {
    const tenant = await this.findTenantByUserId(tenantUserId, companyId);

    return this.tenantActivitiesRepository.find({
      where: {
        tenantId: tenant.id,
        companyId,
        deletedAt: IsNull(),
      },
      order: { dueAt: 'ASC', createdAt: 'DESC' },
    });
  }

  async createActivity(
    tenantUserId: string,
    dto: CreateTenantActivityDto,
    user: UserContext,
  ): Promise<TenantActivity> {
    const tenant = await this.findTenantByUserId(tenantUserId, user.companyId);

    const activity = this.tenantActivitiesRepository.create({
      companyId: user.companyId,
      tenantId: tenant.id,
      type: dto.type,
      status: dto.status ?? TenantActivityStatus.PENDING,
      subject: dto.subject,
      body: dto.body ?? null,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
      metadata: dto.metadata ?? {},
      createdByUserId: user.id,
    });

    if (
      activity.status === TenantActivityStatus.COMPLETED &&
      !activity.completedAt
    ) {
      activity.completedAt = new Date();
    }

    return this.tenantActivitiesRepository.save(activity);
  }

  async updateActivity(
    tenantUserId: string,
    activityId: string,
    dto: UpdateTenantActivityDto,
    companyId: string,
  ): Promise<TenantActivity> {
    const tenant = await this.findTenantByUserId(tenantUserId, companyId);

    const activity = await this.tenantActivitiesRepository.findOne({
      where: {
        id: activityId,
        tenantId: tenant.id,
        companyId,
        deletedAt: IsNull(),
      },
    });

    if (!activity) {
      throw new NotFoundException(
        `Tenant activity with ID ${activityId} not found`,
      );
    }

    Object.assign(activity, {
      ...dto,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : activity.dueAt,
      completedAt:
        dto.completedAt !== undefined
          ? dto.completedAt
            ? new Date(dto.completedAt)
            : null
          : activity.completedAt,
    });

    if (dto.status === TenantActivityStatus.COMPLETED && !activity.completedAt) {
      activity.completedAt = new Date();
    }

    return this.tenantActivitiesRepository.save(activity);
  }
}
