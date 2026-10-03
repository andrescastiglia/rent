import { applyContactNormalization } from '../contact-data/normalization';
import { DomainMutationScope } from '../common/helpers/domain-mutation-scope';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantFiltersDto } from './dto/tenant-filters.dto';
import {
  ContractType,
  Lease,
  LeaseStatus,
} from '../leases/entities/lease.entity';
import { Tenant } from './entities/tenant.entity';
import {
  TenantActivity,
  TenantActivityStatus,
} from './entities/tenant-activity.entity';
import { CreateTenantActivityDto } from './dto/create-tenant-activity.dto';
import { UpdateTenantActivityDto } from './dto/update-tenant-activity.dto';
import { Invoice, InvoiceStatus } from '../payments/entities/invoice.entity';
import { TenantAccount } from '../payments/entities/tenant-account.entity';
import { getUserRoles } from '../common/helpers/role-scope.helper';

interface UserContext {
  id: string;
  companyId: string;
  role: UserRole;
  roles?: UserRole[];
}

export interface TenantSummary {
  tenant: Tenant;
  activeLease: Lease | null;
  currentBalance: number;
  currencyCode: string;
  pendingInvoicesCount: number;
  nextPaymentDueDate: Date | null;
  monthlySummary: {
    period: string;
    pendingAmount: number;
    contractEndDate: Date | null;
    contractExpiresThisMonth: boolean;
    nextAdjustmentDate: Date | null;
    adjustmentDueThisMonth: boolean;
    adjustmentType: string | null;
    adjustmentValue: number | null;
  };
}

@Injectable()
export class TenantsService {
  private readonly scope = new DomainMutationScope((execute) =>
    this._usersRepository.manager.transaction(execute),
  );
  private get tenantsRepository(): Repository<Tenant> {
    return this.scope.repository(Tenant, this._tenantsRepository);
  }
  private get tenantActivitiesRepository(): Repository<TenantActivity> {
    return this.scope.repository(
      TenantActivity,
      this._tenantActivitiesRepository,
    );
  }
  private get usersRepository(): Repository<User> {
    return this.scope.repository(User, this._usersRepository);
  }
  private get leasesRepository(): Repository<Lease> {
    return this.scope.repository(Lease, this._leasesRepository);
  }
  private get invoicesRepository(): Repository<Invoice> {
    return this.scope.repository(Invoice, this._invoicesRepository);
  }
  private get tenantAccountsRepository(): Repository<TenantAccount> {
    return this.scope.repository(TenantAccount, this._tenantAccountsRepository);
  }

  constructor(
    @InjectRepository(Tenant)
    private readonly _tenantsRepository: Repository<Tenant>,
    @InjectRepository(TenantActivity)
    private readonly _tenantActivitiesRepository: Repository<TenantActivity>,
    @InjectRepository(User)
    private readonly _usersRepository: Repository<User>,
    @InjectRepository(Lease)
    private readonly _leasesRepository: Repository<Lease>,
    @InjectRepository(Invoice)
    private readonly _invoicesRepository: Repository<Invoice>,
    @InjectRepository(TenantAccount)
    private readonly _tenantAccountsRepository: Repository<TenantAccount>,
  ) {}

  async create(
    createTenantDto: CreateTenantDto,
    context: UserContext,
    executionKey?: string,
  ): Promise<User> {
    if (!this.scope.manager)
      return this.scope.run(
        context.companyId,
        executionKey,
        'TenantsService.create',
        { ...createTenantDto, actorId: context.id },
        () => this.create(createTenantDto, context),
      );

    this.assertCanManageTenants(context);
    // Check if DNI already exists
    const existingTenant = await this.usersRepository
      .createQueryBuilder('user')
      .innerJoin('tenants', 'tenant', 'tenant.user_id = user.id')
      .where('tenant.dni = :dni', { dni: createTenantDto.dni })
      .andWhere('tenant.company_id = :companyId', {
        companyId: context.companyId,
      })
      .getOne();

    if (existingTenant) {
      throw new ConflictException('A tenant with this DNI already exists');
    }

    // Check if email already exists
    const normalizedEmail = createTenantDto.email?.trim().toLowerCase() || null;
    const existingUser = await this.resolveTenantPerson(
      normalizedEmail,
      context.companyId,
    );
    const savedUser = await this.saveTenantPerson(
      createTenantDto,
      context,
      normalizedEmail,
      existingUser,
    );

    const normalizedContact = {
      companyId: context.companyId,
      ...createTenantDto,
    };
    applyContactNormalization(normalizedContact, createTenantDto, 'tenant', {
      phone: savedUser.phone,
      emergencyContactPhone:
        createTenantDto.emergencyContactPhone ?? createTenantDto.emergencyPhone,
      emergencyPhone:
        createTenantDto.emergencyContactPhone ?? createTenantDto.emergencyPhone,
    });
    const profileFields = [
      ...this.tenantProfileFields(createTenantDto),
      ...['contactAddress', 'contactData', 'latitude', 'longitude']
        .map(
          (key) =>
            [
              (
                {
                  contactAddress: 'contact_address',
                  contactData: 'contact_data',
                } as Record<string, string>
              )[key] ?? key,
              (normalizedContact as Record<string, unknown>)[key],
            ] as [string, unknown],
        )
        .filter(([, v]) => v !== undefined),
    ];
    const tenantRows = await this.usersRepository.query(
      `INSERT INTO tenants (
        user_id, company_id, dni, emergency_contact_name,
        emergency_contact_phone, contact_consent,
        contact_consent_recorded_at, preferred_contact_channel
        ${profileFields.length ? ', ' + profileFields.map(([column]) => column).join(', ') : ''}
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8${profileFields.map((_, index) => ', $' + (index + 9)).join('')}) RETURNING id`,
      [
        savedUser.id,
        context.companyId,
        createTenantDto.dni,
        createTenantDto.emergencyContactName ??
          createTenantDto.emergencyContact,
        createTenantDto.emergencyContactPhone ?? createTenantDto.emergencyPhone,
        createTenantDto.contactConsent ?? false,
        createTenantDto.contactConsent ? new Date() : null,
        createTenantDto.preferredContactChannel ?? 'whatsapp',
        ...profileFields.map(([, value]) => value),
      ],
    );

    return this.tenantResponse(savedUser, {
      ...createTenantDto,
      ...normalizedContact,
      id: tenantRows?.[0]?.id,
      emergencyContactName:
        createTenantDto.emergencyContactName ??
        createTenantDto.emergencyContact,
      emergencyContactPhone:
        createTenantDto.emergencyContactPhone ?? createTenantDto.emergencyPhone,
      contactConsent: createTenantDto.contactConsent ?? false,
      preferredContactChannel:
        createTenantDto.preferredContactChannel ?? 'whatsapp',
    } as unknown as Tenant);
  }

  private async resolveTenantPerson(
    email: string | null,
    companyId: string,
  ): Promise<User | null> {
    const existingUser = email
      ? await this.usersRepository.findOne({
          where: { email, deletedAt: IsNull() },
        })
      : null;

    if (
      existingUser?.companyId !== undefined &&
      existingUser.companyId !== companyId
    ) {
      throw new ConflictException('A user with this email already exists');
    }
    if (existingUser) {
      const existingTenantProfile = await this.tenantsRepository.findOne({
        where: {
          userId: existingUser.id,
          companyId,
          deletedAt: IsNull(),
        },
      });
      if (existingTenantProfile) {
        throw new ConflictException('This person is already a tenant');
      }
    }
    return existingUser;
  }

  private async saveTenantPerson(
    createTenantDto: CreateTenantDto,
    context: UserContext,
    normalizedEmail: string | null,
    existingUser: User | null,
  ): Promise<User> {
    // Hash password
    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(
      createTenantDto.password || randomBytes(32).toString('hex'),
      salt,
    );

    // Create user with tenant role
    return existingUser
      ? await this.usersRepository.save({
          ...existingUser,
          roles: Array.from(
            new Set([
              ...(existingUser.roles?.length
                ? existingUser.roles
                : [existingUser.role]),
              UserRole.TENANT,
            ]),
          ),
          ...(createTenantDto.password && !existingUser.isActive
            ? {
                passwordHash,
                isActive: true,
                accessRequested: true,
              }
            : {}),
        })
      : await this.usersRepository.save(
          this.usersRepository.create({
            companyId: context.companyId,
            email: normalizedEmail,
            passwordHash,
            firstName: createTenantDto.firstName,
            lastName: createTenantDto.lastName,
            phone: createTenantDto.phone,
            role: UserRole.TENANT,
            roles: [UserRole.TENANT],
            isActive: Boolean(normalizedEmail && createTenantDto.password),
            accessRequested: Boolean(
              normalizedEmail && createTenantDto.password,
            ),
          }),
        );
  }

  async findAll(
    filters: TenantFiltersDto,
    user: UserContext,
  ): Promise<{ data: User[]; total: number; page: number; limit: number }> {
    const { name, dni, email, page = 1, limit = 10 } = filters;

    const query = this.usersRepository
      .createQueryBuilder('user')
      .innerJoin(
        'tenants',
        'tenant',
        'tenant.user_id = user.id AND tenant.deleted_at IS NULL',
      )
      .where(':role = ANY(user.roles)', { role: UserRole.TENANT })
      .andWhere('user.company_id = :companyId', { companyId: user.companyId })
      .andWhere('tenant.company_id = :companyId', {
        companyId: user.companyId,
      })
      .andWhere('user.deleted_at IS NULL')
      .distinct(true);

    if (this.hasRole(user, UserRole.OWNER) && !this.canManage(user)) {
      query
        .innerJoin(
          'leases',
          'scopeLease',
          'scopeLease.tenant_id = tenant.id AND scopeLease.company_id = :companyId AND scopeLease.deleted_at IS NULL',
          { companyId: user.companyId },
        )
        .innerJoin(
          'owners',
          'scopeOwner',
          'scopeOwner.id = scopeLease.owner_id AND scopeOwner.user_id = :actorId AND scopeOwner.company_id = :companyId AND scopeOwner.deleted_at IS NULL',
          { actorId: user.id, companyId: user.companyId },
        );
    } else if (this.hasRole(user, UserRole.TENANT)) {
      query.andWhere('user.id = :actorId', { actorId: user.id });
    } else if (!this.canManage(user)) {
      throw new ForbiddenException('Tenant access is not allowed');
    }

    if (name) {
      query.andWhere(
        `unaccent(lower(
          coalesce(user.first_name, '') || ' ' || coalesce(user.last_name, '')
        )) LIKE unaccent(lower(:name))`,
        { name: `%${name}%` },
      );
    }

    if (dni) {
      query.andWhere('lower(tenant.dni) LIKE lower(:dni)', {
        dni: `%${dni}%`,
      });
    }

    if (email) {
      query.andWhere(
        "unaccent(lower(coalesce(user.email, ''))) LIKE unaccent(lower(:email))",
        {
          email: `%${email}%`,
        },
      );
    }

    query.skip((page - 1) * limit).take(limit);

    const [data, total] = await query.getManyAndCount();
    const profiles = data.length
      ? await this.tenantsRepository.find({
          where: {
            userId: In(data.map((person) => person.id)),
            companyId: user.companyId,
            deletedAt: IsNull(),
          },
        })
      : [];
    const byUser = new Map(
      (profiles ?? []).map((profile) => [profile.userId, profile]),
    );

    return {
      data: data.map((person) =>
        this.tenantResponse(person, byUser.get(person.id)),
      ),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string, context: UserContext): Promise<User> {
    await this.findTenantByUserIdScoped(id, context);
    const user = await this.usersRepository.findOne({
      where: {
        id,
        companyId: context.companyId,
        deletedAt: IsNull(),
      },
    });

    if (!user) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    const tenant = await this.tenantsRepository.findOne({
      where: {
        userId: id,
        companyId: context.companyId,
        deletedAt: IsNull(),
      },
    });
    return this.tenantResponse(user, tenant ?? undefined);
  }

  async update(
    id: string,
    updateTenantDto: UpdateTenantDto,
    context: UserContext,
    executionKey?: string,
  ): Promise<User> {
    if (!this.scope.manager)
      return this.scope.run(
        context.companyId,
        executionKey,
        'TenantsService.update',
        { id, ...updateTenantDto, actorId: context.id },
        () => this.update(id, updateTenantDto, context),
      );

    this.assertCanManageTenants(context);
    const user = await this.findOne(id, context);

    // Update user fields
    if (updateTenantDto.firstName) user.firstName = updateTenantDto.firstName;
    if (updateTenantDto.lastName) user.lastName = updateTenantDto.lastName;
    if (updateTenantDto.phone) user.phone = updateTenantDto.phone;
    if (updateTenantDto.email !== undefined) {
      const email = updateTenantDto.email?.trim().toLowerCase() || null;
      const duplicate = email
        ? await this.usersRepository.findOne({
            where: { email, deletedAt: IsNull() },
          })
        : null;
      if (duplicate && duplicate.id !== user.id)
        throw new ConflictException('A user with this email already exists');
      user.email = email;
    }

    await this.usersRepository.save(user);

    await this.updateTenantProfile(id, updateTenantDto, context.companyId);
    const contactProfile = await this.findTenantByUserId(id, context.companyId);
    applyContactNormalization(contactProfile, updateTenantDto, 'tenant', {
      phone: user.phone,
      emergencyContactPhone: contactProfile.emergencyContactPhone,
      emergencyPhone: contactProfile.emergencyContactPhone,
    });
    await this.tenantsRepository.save(contactProfile);

    return this.findOne(id, context);
  }

  private async updateTenantProfile(
    id: string,
    dto: UpdateTenantDto,
    companyId: string,
  ): Promise<void> {
    const fields: Array<[string, unknown]> = [
      ['dni', dto.dni],
      [
        'emergency_contact_name',
        dto.emergencyContactName ?? dto.emergencyContact,
      ],
      [
        'emergency_contact_phone',
        dto.emergencyContactPhone ?? dto.emergencyPhone,
      ],
      ['preferred_contact_channel', dto.preferredContactChannel],
      ...this.tenantProfileFields(dto),
    ];
    if (dto.contactConsent !== undefined) {
      fields.push(
        ['contact_consent', dto.contactConsent],
        ['contact_consent_recorded_at', dto.contactConsent ? new Date() : null],
      );
    }

    const providedFields = fields.filter(([, value]) => value !== undefined);
    if (providedFields.length === 0) return;

    const updates = providedFields.map(
      ([column], index) => `${column} = $${index + 1}`,
    );
    const values = providedFields.map(([, value]) => value);
    values.push(id, companyId);
    await this.usersRepository.query(
      `UPDATE tenants SET ${updates.join(', ')}
        WHERE user_id = $${values.length - 1}
          AND company_id = $${values.length} AND deleted_at IS NULL`,
      values,
    );
  }

  private tenantProfileFields(
    dto: Partial<Omit<CreateTenantDto, 'password'>>,
  ): Array<[string, unknown]> {
    return [
      ['cuil', dto.cuil],
      ['date_of_birth', dto.dateOfBirth],
      ['nationality', dto.nationality],
      ['occupation', dto.occupation],
      ['employer', dto.employer],
      ['monthly_income', dto.monthlyIncome],
      ['employment_status', dto.employmentStatus],
      ['emergency_contact_relationship', dto.emergencyContactRelationship],
      ['credit_score', dto.creditScore],
      ['notes', dto.notes],
    ].filter(([, value]) => value !== undefined) as Array<[string, unknown]>;
  }

  private tenantResponse(user: User, tenant?: Tenant): User {
    const response = { ...user };
    delete (response as Partial<User>).passwordHash;
    const profile = tenant ?? ({} as Tenant);
    Object.assign(response, {
      tenantEntityId: profile.id,
      contactAddress: profile.contactAddress,
      contactData: profile.contactData,
      latitude: profile.latitude,
      longitude: profile.longitude,
      dni: profile.dni,
      cuil: profile.cuil,
      dateOfBirth: profile.dateOfBirth,
      nationality: profile.nationality,
      occupation: profile.occupation,
      employer: profile.employer,
      monthlyIncome: profile.monthlyIncome,
      employmentStatus: profile.employmentStatus,
      emergencyContactName: profile.emergencyContactName,
      emergencyContactPhone: profile.emergencyContactPhone,
      emergencyContactRelationship: profile.emergencyContactRelationship,
      creditScore: profile.creditScore,
      notes: profile.notes,
      contactConsent: profile.contactConsent ?? false,
      preferredContactChannel: profile.preferredContactChannel ?? 'whatsapp',
    });
    return response;
  }

  async remove(
    id: string,
    context: UserContext,
    executionKey?: string,
  ): Promise<void> {
    if (!this.scope.manager)
      return this.scope.run(
        context.companyId,
        executionKey,
        'TenantsService.remove',
        { id, actorId: context.id },
        () => this.remove(id, context),
      );

    this.assertCanManageTenants(context);
    const user = await this.findOne(id, context);
    const tenant = await this.findTenantByUserId(id, context.companyId);
    const remainingRoles = getUserRoles(user).filter(
      (role) => role !== UserRole.TENANT,
    );

    if (remainingRoles.length > 0) {
      user.roles = remainingRoles;
      if (user.role === UserRole.TENANT) {
        user.role = remainingRoles[0];
      }
    } else {
      user.isActive = false;
    }

    await this.usersRepository.save(user);
    await this.tenantsRepository.softDelete(tenant.id);
  }

  async getLeaseHistory(
    tenantUserId: string,
    context: UserContext,
  ): Promise<Lease[]> {
    const tenant = await this.findTenantByUserIdScoped(tenantUserId, context);
    if (this.hasRole(context, UserRole.OWNER) && !this.canManage(context)) {
      return this.leasesRepository
        .createQueryBuilder('lease')
        .leftJoinAndSelect('lease.property', 'property')
        .innerJoin('lease.owner', 'scopeOwner')
        .where('lease.tenant_id = :tenantId', { tenantId: tenant.id })
        .andWhere('lease.company_id = :companyId', {
          companyId: context.companyId,
        })
        .andWhere('lease.contract_type = :contractType', {
          contractType: ContractType.RENTAL,
        })
        .andWhere('lease.deleted_at IS NULL')
        .andWhere('scopeOwner.user_id = :actorId', { actorId: context.id })
        .orderBy('lease.start_date', 'DESC')
        .getMany();
    }
    return this.leasesRepository.find({
      where: {
        tenantId: tenant.id,
        companyId: context.companyId,
        contractType: ContractType.RENTAL,
        deletedAt: IsNull(),
      },
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

  private async findTenantByUserIdScoped(
    userId: string,
    context: UserContext,
  ): Promise<Tenant> {
    if (this.canManage(context)) {
      return this.findTenantByUserId(userId, context.companyId);
    }
    const query = this.tenantsRepository
      .createQueryBuilder('tenant')
      .where('tenant.user_id = :userId', { userId })
      .andWhere('tenant.company_id = :companyId', {
        companyId: context.companyId,
      })
      .andWhere('tenant.deleted_at IS NULL');
    if (this.hasRole(context, UserRole.OWNER)) {
      query
        .innerJoin(
          Lease,
          'scopeLease',
          'scopeLease.tenant_id = tenant.id AND scopeLease.company_id = :companyId AND scopeLease.deleted_at IS NULL',
          { companyId: context.companyId },
        )
        .innerJoin(
          'owners',
          'scopeOwner',
          'scopeOwner.id = scopeLease.owner_id AND scopeOwner.user_id = :actorId AND scopeOwner.company_id = :companyId AND scopeOwner.deleted_at IS NULL',
          { actorId: context.id, companyId: context.companyId },
        );
    } else if (this.hasRole(context, UserRole.TENANT)) {
      query.andWhere('tenant.user_id = :actorId', { actorId: context.id });
    } else {
      throw new ForbiddenException('Tenant access is not allowed');
    }
    const tenant = await query.getOne();
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${userId} not found`);
    }
    return tenant;
  }

  private assertCanManageTenants(context: UserContext): void {
    if (!this.canManage(context)) {
      throw new ForbiddenException('Tenant management is not allowed');
    }
  }

  private hasRole(context: UserContext, role: UserRole): boolean {
    const roles = context.roles?.length ? context.roles : [context.role];
    return roles.includes(role);
  }

  private canManage(context: UserContext): boolean {
    return (
      this.hasRole(context, UserRole.ADMIN) ||
      this.hasRole(context, UserRole.STAFF)
    );
  }

  private async ensureTenantHasRentalLease(tenantId: string): Promise<void> {
    const lease = await this.leasesRepository.findOne({
      where: {
        tenantId,
        contractType: ContractType.RENTAL,
        status: LeaseStatus.ACTIVE,
        deletedAt: IsNull(),
      },
      select: ['id'],
    });

    if (!lease) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }
  }

  async listActivities(
    tenantUserId: string,
    context: UserContext,
  ): Promise<TenantActivity[]> {
    const tenant = await this.findTenantByUserIdScoped(tenantUserId, context);

    return this.tenantActivitiesRepository.find({
      where: {
        tenantId: tenant.id,
        companyId: context.companyId,
        deletedAt: IsNull(),
      },
      order: { dueAt: 'ASC', createdAt: 'DESC' },
    });
  }

  async createActivity(
    tenantUserId: string,
    dto: CreateTenantActivityDto,
    user: UserContext,
    executionKey?: string,
  ): Promise<TenantActivity> {
    if (!this.scope.manager)
      return this.scope.run(
        user.companyId,
        executionKey,
        'TenantsService.createActivity',
        { id: tenantUserId, ...dto, actorId: user.id },
        () => this.createActivity(tenantUserId, dto, user),
      );

    const tenant = await this.findTenantByUserIdScoped(tenantUserId, user);

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
    context: UserContext,
    executionKey?: string,
  ): Promise<TenantActivity> {
    if (!this.scope.manager)
      return this.scope.run(
        context.companyId,
        executionKey,
        'TenantsService.updateActivity',
        { id: tenantUserId, activityId, ...dto, actorId: context.id },
        () => this.updateActivity(tenantUserId, activityId, dto, context),
      );

    const tenant = await this.findTenantByUserIdScoped(tenantUserId, context);

    const activity = await this.tenantActivitiesRepository.findOne({
      where: {
        id: activityId,
        tenantId: tenant.id,
        companyId: context.companyId,
        deletedAt: IsNull(),
      },
    });

    if (!activity) {
      throw new NotFoundException(
        `Tenant activity with ID ${activityId} not found`,
      );
    }

    let resolvedCompletedAt: Date | null;
    if (dto.completedAt) {
      resolvedCompletedAt = new Date(dto.completedAt);
    } else if (dto.completedAt === undefined) {
      resolvedCompletedAt = activity.completedAt;
    } else {
      resolvedCompletedAt = null;
    }

    Object.assign(activity, {
      ...dto,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : activity.dueAt,
      completedAt: resolvedCompletedAt,
    });

    if (
      dto.status === TenantActivityStatus.COMPLETED &&
      !activity.completedAt
    ) {
      activity.completedAt = new Date();
    }

    return this.tenantActivitiesRepository.save(activity);
  }

  async findByUserId(userId: string, companyId: string): Promise<Tenant> {
    return this.findTenantByUserId(userId, companyId);
  }

  async getTenantSummary(
    userId: string,
    companyId: string,
  ): Promise<TenantSummary> {
    const tenant = await this.findTenantByUserId(userId, companyId);

    const activeLease = await this.leasesRepository.findOne({
      where: {
        tenantId: tenant.id,
        contractType: ContractType.RENTAL,
        status: LeaseStatus.ACTIVE,
        companyId,
        deletedAt: IsNull(),
      },
      relations: ['property'],
      order: { createdAt: 'DESC' },
    });

    let currentBalance = 0;
    let currencyCode = 'ARS';
    let pendingInvoicesCount = 0;
    let nextPaymentDueDate: Date | null = null;
    let pendingAmount = 0;

    if (activeLease) {
      const account = await this.tenantAccountsRepository.findOne({
        where: { leaseId: activeLease.id, deletedAt: IsNull() },
      });

      if (account) {
        currentBalance = Number(account.balance);
        currencyCode = account.currencyCode;
      }

      const pendingInvoices = await this.invoicesRepository.find({
        where: [
          {
            leaseId: activeLease.id,
            companyId,
            status: InvoiceStatus.PENDING,
            deletedAt: IsNull(),
          },
          {
            leaseId: activeLease.id,
            companyId,
            status: InvoiceStatus.OVERDUE,
            deletedAt: IsNull(),
          },
          {
            leaseId: activeLease.id,
            companyId,
            status: InvoiceStatus.SENT,
            deletedAt: IsNull(),
          },
        ],
        order: { dueDate: 'ASC' },
        select: ['id', 'dueDate', 'status', 'total'],
      });

      pendingInvoicesCount = pendingInvoices.length;
      pendingAmount = pendingInvoices.reduce(
        (sum, invoice) => sum + Number(invoice.total ?? 0),
        0,
      );

      if (pendingInvoices.length > 0) {
        nextPaymentDueDate = pendingInvoices[0].dueDate;
      }
    }

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const isInCurrentMonth = (value: Date | null | undefined): boolean =>
      Boolean(
        value?.getUTCFullYear() === now.getUTCFullYear() &&
        value?.getUTCMonth() === now.getUTCMonth(),
      );

    return {
      tenant,
      activeLease,
      currentBalance,
      currencyCode,
      pendingInvoicesCount,
      nextPaymentDueDate,
      monthlySummary: {
        period,
        pendingAmount,
        contractEndDate: activeLease?.endDate ?? null,
        contractExpiresThisMonth: isInCurrentMonth(activeLease?.endDate),
        nextAdjustmentDate: activeLease?.nextAdjustmentDate ?? null,
        adjustmentDueThisMonth: isInCurrentMonth(
          activeLease?.nextAdjustmentDate,
        ),
        adjustmentType: activeLease?.adjustmentType ?? null,
        adjustmentValue:
          activeLease?.adjustmentValue === undefined ||
          activeLease?.adjustmentValue === null
            ? null
            : Number(activeLease.adjustmentValue),
      },
    };
  }
}
