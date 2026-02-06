import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  InterestedProfile,
  InterestedOperation,
  InterestedPropertyType,
  InterestedQualificationLevel,
  InterestedStatus,
} from './entities/interested-profile.entity';
import { CreateInterestedProfileDto } from './dto/create-interested-profile.dto';
import { UpdateInterestedProfileDto } from './dto/update-interested-profile.dto';
import { InterestedFiltersDto } from './dto/interested-filters.dto';
import {
  Property,
  PropertyStatus,
  PropertyType,
} from '../properties/entities/property.entity';
import { UnitStatus } from '../properties/entities/unit.entity';
import { InterestedStageHistory } from './entities/interested-stage-history.entity';
import {
  InterestedActivity,
  InterestedActivityStatus,
  InterestedActivityType,
} from './entities/interested-activity.entity';
import {
  InterestedMatchStatus,
  InterestedPropertyMatch,
} from './entities/interested-property-match.entity';
import { ChangeInterestedStageDto } from './dto/change-interested-stage.dto';
import { CreateInterestedActivityDto } from './dto/create-interested-activity.dto';
import { UpdateInterestedActivityDto } from './dto/update-interested-activity.dto';
import { UpdateInterestedMatchDto } from './dto/update-interested-match.dto';
import { PropertyVisit } from '../properties/entities/property-visit.entity';
import { ConvertInterestedToTenantDto } from './dto/convert-interested-to-tenant.dto';
import { User, UserRole } from '../users/entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { ConvertInterestedToBuyerDto } from './dto/convert-interested-to-buyer.dto';
import { SaleAgreement } from '../sales/entities/sale-agreement.entity';
import { SaleFolder } from '../sales/entities/sale-folder.entity';

interface UserContext {
  id: string;
  role: string;
  companyId?: string;
}

interface InterestedMetrics {
  byStage: Record<string, number>;
  totalLeads: number;
  conversionRate: number;
  avgHoursToClose: number;
  activityByAgent: Array<{
    userId: string;
    activityCount: number;
    wonCount: number;
  }>;
}

interface TimelineItem {
  id: string;
  type: 'stage' | 'activity' | 'match' | 'visit';
  at: string;
  title: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class InterestedService {
  constructor(
    @InjectRepository(InterestedProfile)
    private readonly interestedRepository: Repository<InterestedProfile>,
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
    @InjectRepository(InterestedStageHistory)
    private readonly stageHistoryRepository: Repository<InterestedStageHistory>,
    @InjectRepository(InterestedActivity)
    private readonly activityRepository: Repository<InterestedActivity>,
    @InjectRepository(InterestedPropertyMatch)
    private readonly matchRepository: Repository<InterestedPropertyMatch>,
    @InjectRepository(PropertyVisit)
    private readonly propertyVisitsRepository: Repository<PropertyVisit>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Tenant)
    private readonly tenantsRepository: Repository<Tenant>,
    @InjectRepository(SaleAgreement)
    private readonly saleAgreementsRepository: Repository<SaleAgreement>,
    @InjectRepository(SaleFolder)
    private readonly saleFoldersRepository: Repository<SaleFolder>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateInterestedProfileDto,
    user: UserContext,
  ): Promise<InterestedProfile> {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }

    await this.validateDuplicates(user.companyId, dto.phone, dto.email);

    const profile = this.interestedRepository.create({
      ...dto,
      companyId: user.companyId,
      status: dto.status ?? InterestedStatus.NEW,
    });
    const created = await this.interestedRepository.save(profile);

    await this.stageHistoryRepository.save(
      this.stageHistoryRepository.create({
        interestedProfileId: created.id,
        fromStatus: created.status,
        toStatus: created.status,
        reason: 'Lead created',
        changedByUserId: user.id,
      }),
    );

    return created;
  }

  async findAll(
    filters: InterestedFiltersDto,
    user: UserContext,
  ): Promise<{
    data: InterestedProfile[];
    total: number;
    page: number;
    limit: number;
  }> {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }

    const {
      name,
      phone,
      operation,
      propertyTypePreference,
      status,
      qualificationLevel,
      page = 1,
      limit = 10,
    } = filters;

    const query = this.interestedRepository
      .createQueryBuilder('interested')
      .where('interested.deleted_at IS NULL')
      .andWhere('interested.company_id = :companyId', {
        companyId: user.companyId,
      });

    if (name) {
      query.andWhere(
        '(interested.first_name ILIKE :name OR interested.last_name ILIKE :name)',
        { name: `%${name}%` },
      );
    }

    if (phone) {
      query.andWhere('interested.phone ILIKE :phone', { phone: `%${phone}%` });
    }

    if (operation) {
      query.andWhere('interested.operation = :operation', { operation });
    }

    if (propertyTypePreference) {
      query.andWhere(
        'interested.property_type_preference = :propertyTypePreference',
        {
          propertyTypePreference,
        },
      );
    }

    if (status) {
      query.andWhere('interested.status = :status', { status });
    }

    if (qualificationLevel) {
      query.andWhere('interested.qualification_level = :qualificationLevel', {
        qualificationLevel,
      });
    }

    query
      .orderBy('interested.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await query.getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: string, user: UserContext): Promise<InterestedProfile> {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }

    const profile = await this.interestedRepository.findOne({
      where: { id, companyId: user.companyId, deletedAt: IsNull() },
      relations: ['assignedToUser'],
    });

    if (!profile) {
      throw new NotFoundException(`Interested profile with ID ${id} not found`);
    }

    return profile;
  }

  async update(
    id: string,
    dto: UpdateInterestedProfileDto,
    user: UserContext,
  ): Promise<InterestedProfile> {
    const profile = await this.findOne(id, user);

    if (dto.phone && dto.phone !== profile.phone) {
      await this.validateDuplicates(
        profile.companyId,
        dto.phone,
        dto.email ?? profile.email,
        profile.id,
      );
    }

    if (dto.email && dto.email !== profile.email) {
      await this.validateDuplicates(
        profile.companyId,
        dto.phone ?? profile.phone,
        dto.email,
        profile.id,
      );
    }

    const previousStatus = profile.status;
    Object.assign(profile, dto);
    const updated = await this.interestedRepository.save(profile);

    if (dto.status && dto.status !== previousStatus) {
      await this.stageHistoryRepository.save(
        this.stageHistoryRepository.create({
          interestedProfileId: profile.id,
          fromStatus: previousStatus,
          toStatus: dto.status,
          reason: dto.lostReason,
          changedByUserId: user.id,
        }),
      );
    }

    return updated;
  }

  async remove(id: string, user: UserContext): Promise<void> {
    const profile = await this.findOne(id, user);
    await this.interestedRepository.softDelete(profile.id);
  }

  async findMatches(id: string, user: UserContext): Promise<Property[]> {
    const profile = await this.findOne(id, user);

    const query = this.propertiesRepository
      .createQueryBuilder('property')
      .leftJoinAndSelect('property.units', 'units')
      .where('property.deleted_at IS NULL')
      .andWhere('property.company_id = :companyId', {
        companyId: profile.companyId,
      })
      .andWhere('property.status = :status', { status: PropertyStatus.ACTIVE });

    const propertyType = this.mapPreferenceToPropertyType(
      profile.propertyTypePreference,
    );
    if (propertyType) {
      query.andWhere('property.property_type = :propertyType', {
        propertyType,
      });
    }

    if (profile.operation === InterestedOperation.RENT) {
      query.andWhere('units.status = :unitStatus', {
        unitStatus: UnitStatus.AVAILABLE,
      });
      query.andWhere('units.base_rent IS NOT NULL');
      if (profile.maxAmount !== null && profile.maxAmount !== undefined) {
        query.andWhere('units.base_rent <= :maxAmount', {
          maxAmount: profile.maxAmount,
        });
      }
    }

    if (profile.operation === InterestedOperation.SALE) {
      query.andWhere('property.sale_price IS NOT NULL');
      if (profile.maxAmount !== null && profile.maxAmount !== undefined) {
        query.andWhere('property.sale_price <= :maxAmount', {
          maxAmount: profile.maxAmount,
        });
      }
    }

    if (profile.peopleCount !== null && profile.peopleCount !== undefined) {
      query.andWhere(
        '(property.max_occupants IS NULL OR property.max_occupants >= :peopleCount)',
        { peopleCount: profile.peopleCount },
      );
    }

    if (profile.hasPets) {
      query.andWhere('property.allows_pets = TRUE');
    }

    if (profile.whiteIncome === false) {
      query.andWhere(
        '(property.requires_white_income = FALSE OR property.requires_white_income IS NULL)',
      );
    }

    if (profile.guaranteeTypes && profile.guaranteeTypes.length > 0) {
      query.andWhere(
        '(property.accepted_guarantee_types IS NULL OR array_length(property.accepted_guarantee_types, 1) = 0 OR property.accepted_guarantee_types && :guaranteeTypes)',
        { guaranteeTypes: profile.guaranteeTypes },
      );
    }

    const properties = await query.getMany();
    return properties;
  }

  async refreshMatches(
    id: string,
    user: UserContext,
  ): Promise<InterestedPropertyMatch[]> {
    const profile = await this.findOne(id, user);
    const properties = await this.findMatches(id, user);

    const now = new Date();
    const existing = await this.matchRepository.find({
      where: { interestedProfileId: profile.id, deletedAt: IsNull() },
    });
    const existingByProperty = new Map(existing.map((m) => [m.propertyId, m]));

    const toSave: InterestedPropertyMatch[] = [];
    for (const property of properties) {
      const score = this.calculateMatchScore(profile, property);
      const reasons = this.buildMatchReasons(profile, property);
      const match = existingByProperty.get(property.id);
      if (match) {
        match.score = score;
        match.matchReasons = reasons;
        match.lastMatchedAt = now;
        toSave.push(match);
        continue;
      }

      toSave.push(
        this.matchRepository.create({
          companyId: profile.companyId,
          interestedProfileId: profile.id,
          propertyId: property.id,
          status: InterestedMatchStatus.SUGGESTED,
          score,
          matchReasons: reasons,
          firstMatchedAt: now,
          lastMatchedAt: now,
          createdByUserId: user.id,
        }),
      );
    }

    const saved = await this.matchRepository.save(toSave);

    if (saved.length > 0) {
      await this.changeStage(
        profile.id,
        { toStatus: InterestedStatus.MATCHING, reason: 'Matches refreshed' },
        user,
      );
    }

    return this.listMatches(profile.id, user);
  }

  async listMatches(
    id: string,
    user: UserContext,
  ): Promise<InterestedPropertyMatch[]> {
    const profile = await this.findOne(id, user);

    return this.matchRepository.find({
      where: {
        interestedProfileId: profile.id,
        companyId: profile.companyId,
        deletedAt: IsNull(),
      },
      relations: ['property'],
      order: { score: 'DESC', updatedAt: 'DESC' },
    });
  }

  async updateMatch(
    id: string,
    matchId: string,
    dto: UpdateInterestedMatchDto,
    user: UserContext,
  ): Promise<InterestedPropertyMatch> {
    const profile = await this.findOne(id, user);

    const match = await this.matchRepository.findOne({
      where: {
        id: matchId,
        interestedProfileId: profile.id,
        companyId: profile.companyId,
        deletedAt: IsNull(),
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    match.status = dto.status;
    if (dto.notes !== undefined) {
      match.notes = dto.notes;
    }
    if (dto.status === InterestedMatchStatus.CONTACTED) {
      match.contactedAt = new Date();
      await this.createActivity(
        profile.id,
        {
          type: InterestedActivityType.WHATSAPP,
          subject: 'Contacto por match',
          body: `Se contacto propiedad ${match.propertyId}`,
          status: InterestedActivityStatus.COMPLETED,
          completedAt: new Date().toISOString(),
        },
        user,
      );
    }

    return this.matchRepository.save(match);
  }

  async changeStage(
    id: string,
    dto: ChangeInterestedStageDto,
    user: UserContext,
  ): Promise<InterestedProfile> {
    const profile = await this.findOne(id, user);

    const fromStatus = profile.status;
    if (fromStatus === dto.toStatus) {
      return profile;
    }

    if (dto.toStatus === InterestedStatus.WON) {
      const reason = dto.reason?.toLowerCase() ?? '';
      const isRentReason =
        reason.includes('alquiler') ||
        reason.includes('rent') ||
        reason.includes('renta');
      const isSaleReason =
        reason.includes('compra') ||
        reason.includes('venta') ||
        reason.includes('sale') ||
        reason.includes('purchase');

      if (
        (isRentReason || profile.operation === InterestedOperation.RENT) &&
        !profile.convertedToTenantId
      ) {
        const converted = await this.convertToTenant(id, {}, user);
        if (dto.reason) {
          await this.createActivity(
            id,
            {
              type: InterestedActivityType.NOTE,
              subject: 'Cierre por alquiler',
              body: dto.reason,
              status: InterestedActivityStatus.COMPLETED,
              completedAt: new Date().toISOString(),
            },
            user,
          );
        }
        return converted.profile;
      }

      if (
        (isSaleReason || profile.operation === InterestedOperation.SALE) &&
        !profile.convertedToSaleAgreementId
      ) {
        await this.createActivity(
          id,
          {
            type: InterestedActivityType.NOTE,
            subject: 'Cierre por compra',
            body: dto.reason ?? 'Requiere conversion a comprador',
            status: InterestedActivityStatus.COMPLETED,
            completedAt: new Date().toISOString(),
          },
          user,
        );
      }
    }

    profile.status = dto.toStatus;
    if (dto.toStatus === InterestedStatus.LOST) {
      profile.lostReason = dto.reason ?? profile.lostReason;
    }

    const updated = await this.interestedRepository.save(profile);

    await this.stageHistoryRepository.save(
      this.stageHistoryRepository.create({
        interestedProfileId: id,
        fromStatus,
        toStatus: dto.toStatus,
        reason: dto.reason,
        changedByUserId: user.id,
      }),
    );

    return updated;
  }

  async createActivity(
    id: string,
    dto: CreateInterestedActivityDto,
    user: UserContext,
  ): Promise<InterestedActivity> {
    const profile = await this.findOne(id, user);

    const activity = new InterestedActivity();
    activity.interestedProfileId = profile.id;
    activity.type = dto.type;
    activity.status = dto.status ?? InterestedActivityStatus.PENDING;
    activity.subject = dto.subject;
    if (dto.body !== undefined) {
      activity.body = dto.body;
    }
    if (dto.dueAt) {
      activity.dueAt = new Date(dto.dueAt);
    }
    if (dto.completedAt) {
      activity.completedAt = new Date(dto.completedAt);
    }
    if (dto.templateName !== undefined) {
      activity.templateName = dto.templateName;
    }
    activity.metadata = dto.metadata ?? {};
    activity.createdByUserId = user.id;

    if (
      activity.completedAt &&
      activity.status === InterestedActivityStatus.PENDING
    ) {
      activity.status = InterestedActivityStatus.COMPLETED;
    }

    if (
      activity.status === InterestedActivityStatus.COMPLETED &&
      !activity.completedAt
    ) {
      activity.completedAt = new Date();
    }

    const saved = await this.activityRepository.save(activity);

    profile.lastContactAt = new Date();
    if (activity.dueAt) {
      profile.nextContactAt = activity.dueAt;
    }
    await this.interestedRepository.save(profile);

    return saved;
  }

  async updateActivity(
    id: string,
    activityId: string,
    dto: UpdateInterestedActivityDto,
    user: UserContext,
  ): Promise<InterestedActivity> {
    await this.findOne(id, user);

    const activity = await this.activityRepository.findOne({
      where: {
        id: activityId,
        interestedProfileId: id,
      },
    });

    if (!activity) {
      throw new NotFoundException('Activity not found');
    }

    Object.assign(activity, {
      ...dto,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : activity.dueAt,
      completedAt: dto.completedAt
        ? new Date(dto.completedAt)
        : activity.completedAt,
    });

    if (
      dto.status === InterestedActivityStatus.COMPLETED &&
      !activity.completedAt
    ) {
      activity.completedAt = new Date();
    }

    return this.activityRepository.save(activity);
  }

  async getSummary(
    id: string,
    user: UserContext,
  ): Promise<{
    profile: InterestedProfile;
    stageHistory: InterestedStageHistory[];
    activities: InterestedActivity[];
    matches: InterestedPropertyMatch[];
    visits: PropertyVisit[];
  }> {
    const profile = await this.findOne(id, user);

    const [stageHistory, activities, matches, visits] = await Promise.all([
      this.stageHistoryRepository.find({
        where: { interestedProfileId: profile.id },
        order: { changedAt: 'DESC' },
      }),
      this.activityRepository.find({
        where: { interestedProfileId: profile.id },
        order: { createdAt: 'DESC' },
      }),
      this.listMatches(profile.id, user),
      this.propertyVisitsRepository.find({
        where: { interestedProfileId: profile.id },
        relations: ['property'],
        order: { visitedAt: 'DESC' },
      }),
    ]);

    return {
      profile,
      stageHistory,
      activities,
      matches,
      visits,
    };
  }

  async getTimeline(id: string, user: UserContext): Promise<TimelineItem[]> {
    const summary = await this.getSummary(id, user);

    const stageItems: TimelineItem[] = summary.stageHistory.map((item) => ({
      id: item.id,
      type: 'stage',
      at: item.changedAt.toISOString(),
      title: `Etapa: ${item.fromStatus} -> ${item.toStatus}`,
      detail: item.reason ?? undefined,
      metadata: {
        fromStatus: item.fromStatus,
        toStatus: item.toStatus,
      },
    }));

    const activityItems: TimelineItem[] = summary.activities.map((item) => ({
      id: item.id,
      type: 'activity',
      at: item.createdAt.toISOString(),
      title: `${item.type.toUpperCase()}: ${item.subject}`,
      detail: item.body ?? undefined,
      metadata: {
        activityType: item.type,
        subject: item.subject,
        status: item.status,
        dueAt: item.dueAt ? item.dueAt.toISOString() : null,
      },
    }));

    const matchItems: TimelineItem[] = summary.matches.map((item) => ({
      id: item.id,
      type: 'match',
      at: item.updatedAt.toISOString(),
      title: `Match propiedad ${item.property?.name ?? item.propertyId}`,
      detail: item.notes ?? undefined,
      metadata: {
        status: item.status,
        propertyName: item.property?.name,
        propertyId: item.propertyId,
        score: item.score,
      },
    }));

    const visitItems: TimelineItem[] = summary.visits.map((item) => ({
      id: item.id,
      type: 'visit',
      at: item.visitedAt.toISOString(),
      title: `Visita a ${item.property?.name ?? item.propertyId}`,
      detail: item.comments ?? undefined,
      metadata: {
        propertyName: item.property?.name,
        propertyId: item.propertyId,
        offerAmount: item.offerAmount,
        offerCurrency: item.offerCurrency,
        hasOffer: item.hasOffer,
      },
    }));

    return [...stageItems, ...activityItems, ...matchItems, ...visitItems].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }

  async findPotentialDuplicates(user: UserContext): Promise<
    Array<{
      phone: string;
      email?: string;
      count: number;
      profileIds: string[];
    }>
  > {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }

    const byPhone = await this.interestedRepository
      .createQueryBuilder('interested')
      .select('interested.phone', 'phone')
      .addSelect('MIN(interested.email)', 'email')
      .addSelect('COUNT(*)', 'count')
      .addSelect('ARRAY_AGG(interested.id)', 'profileIds')
      .where('interested.company_id = :companyId', {
        companyId: user.companyId,
      })
      .andWhere('interested.deleted_at IS NULL')
      .groupBy('interested.phone')
      .having('COUNT(*) > 1')
      .getRawMany<{
        phone: string;
        email?: string;
        count: string;
        profileids: string[];
      }>();

    return byPhone.map((row) => ({
      phone: row.phone,
      email: row.email,
      count: Number(row.count),
      profileIds: row.profileids,
    }));
  }

  async convertToTenant(
    id: string,
    dto: ConvertInterestedToTenantDto,
    user: UserContext,
  ): Promise<{ profile: InterestedProfile; tenant: Tenant; user: User }> {
    const profile = await this.findOne(id, user);

    if (profile.convertedToTenantId) {
      throw new ConflictException(
        'Interested profile already converted to tenant',
      );
    }

    const email = dto.email ?? this.buildFallbackEmail(profile);
    const existingUser = await this.usersRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const password = dto.password ?? this.generateRandomPassword();
    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(password, salt);

    const fullName = this.resolveName(profile);
    const firstName = fullName.firstName;
    const lastName = fullName.lastName;

    const previousStatus = profile.status;
    const created = await this.dataSource.transaction(async (manager) => {
      const userEntity = manager.getRepository(User).create({
        companyId: profile.companyId,
        email,
        passwordHash,
        firstName,
        lastName,
        phone: profile.phone,
        role: UserRole.TENANT,
        isActive: true,
      });
      const createdUser = await manager.getRepository(User).save(userEntity);

      const tenantEntity = manager.getRepository(Tenant).create({
        userId: createdUser.id,
        companyId: profile.companyId,
        dni: dto.dni,
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
        notes: profile.notes,
      });
      const createdTenant = await manager
        .getRepository(Tenant)
        .save(tenantEntity);

      profile.convertedToTenantId = createdTenant.id;
      profile.status = InterestedStatus.WON;
      profile.qualificationLevel =
        profile.qualificationLevel ?? InterestedQualificationLevel.SQL;
      await manager.getRepository(InterestedProfile).save(profile);

      await manager.getRepository(InterestedStageHistory).save(
        manager.getRepository(InterestedStageHistory).create({
          interestedProfileId: profile.id,
          fromStatus: previousStatus,
          toStatus: InterestedStatus.WON,
          reason: 'Converted to tenant',
          changedByUserId: user.id,
        }),
      );

      await manager.getRepository(InterestedActivity).save(
        manager.getRepository(InterestedActivity).create({
          interestedProfileId: profile.id,
          type: InterestedActivityType.NOTE,
          status: InterestedActivityStatus.COMPLETED,
          subject: 'Lead convertido a inquilino',
          body: `Tenant ${createdTenant.id} / User ${createdUser.email}`,
          createdByUserId: user.id,
          completedAt: new Date(),
        } as Partial<InterestedActivity>),
      );

      return { createdTenant, createdUser };
    });

    return {
      profile: await this.findOne(id, user),
      tenant: created.createdTenant,
      user: created.createdUser,
    };
  }

  async convertToBuyer(
    id: string,
    dto: ConvertInterestedToBuyerDto,
    user: UserContext,
  ): Promise<{ profile: InterestedProfile; agreement: SaleAgreement }> {
    const profile = await this.findOne(id, user);

    if (profile.convertedToSaleAgreementId) {
      throw new ConflictException(
        'Interested profile already converted to sale agreement',
      );
    }

    const folder = await this.saleFoldersRepository.findOne({
      where: {
        id: dto.folderId,
        companyId: profile.companyId,
        deletedAt: IsNull(),
      },
    });

    if (!folder) {
      throw new NotFoundException('Sale folder not found');
    }

    const agreement = this.saleAgreementsRepository.create({
      companyId: profile.companyId,
      folderId: dto.folderId,
      buyerName: this.resolveName(profile).fullName,
      buyerPhone: profile.phone,
      totalAmount: dto.totalAmount,
      currency: dto.currency ?? 'ARS',
      installmentAmount: dto.installmentAmount,
      installmentCount: dto.installmentCount,
      startDate: dto.startDate,
      dueDay: 10,
      notes: dto.notes ?? profile.notes,
    });

    const savedAgreement = await this.saleAgreementsRepository.save(agreement);

    const previousStatus = profile.status;
    profile.convertedToSaleAgreementId = savedAgreement.id;
    profile.status = InterestedStatus.WON;
    await this.interestedRepository.save(profile);

    await this.stageHistoryRepository.save(
      this.stageHistoryRepository.create({
        interestedProfileId: profile.id,
        fromStatus: previousStatus,
        toStatus: InterestedStatus.WON,
        reason: 'Converted to buyer',
        changedByUserId: user.id,
      }),
    );

    return {
      profile,
      agreement: savedAgreement,
    };
  }

  async getMetrics(user: UserContext): Promise<InterestedMetrics> {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }

    const profiles = await this.interestedRepository.find({
      where: { companyId: user.companyId, deletedAt: IsNull() },
    });

    const activitiesRaw = await this.activityRepository
      .createQueryBuilder('activity')
      .select('activity.created_by_user_id', 'userId')
      .addSelect('COUNT(*)', 'activityCount')
      .where('activity.created_by_user_id IS NOT NULL')
      .groupBy('activity.created_by_user_id')
      .getRawMany<{ userId: string; activityCount: string }>();

    const wonByAgentRaw = await this.stageHistoryRepository
      .createQueryBuilder('history')
      .select('history.changed_by_user_id', 'userId')
      .addSelect('COUNT(*)', 'wonCount')
      .where('history.to_status = :won', { won: InterestedStatus.WON })
      .andWhere('history.changed_by_user_id IS NOT NULL')
      .groupBy('history.changed_by_user_id')
      .getRawMany<{ userId: string; wonCount: string }>();

    const byStage: Record<string, number> = {};
    for (const profile of profiles) {
      byStage[profile.status] = (byStage[profile.status] ?? 0) + 1;
    }

    const totalLeads = profiles.length;
    const wonCount = byStage[InterestedStatus.WON] ?? 0;
    const conversionRate = totalLeads > 0 ? (wonCount / totalLeads) * 100 : 0;

    const wonProfiles = profiles.filter(
      (profile) => profile.status === InterestedStatus.WON,
    );
    const avgHoursToClose =
      wonProfiles.length > 0
        ? wonProfiles.reduce((acc, profile) => {
            const createdAt = profile.createdAt.getTime();
            const updatedAt = profile.updatedAt.getTime();
            return acc + (updatedAt - createdAt) / (1000 * 60 * 60);
          }, 0) / wonProfiles.length
        : 0;

    const wonByAgentMap = new Map<string, number>(
      wonByAgentRaw.map((item) => [item.userId, Number(item.wonCount)]),
    );

    const activityByAgent = activitiesRaw.map((activityItem) => ({
      userId: activityItem.userId,
      activityCount: Number(activityItem.activityCount),
      wonCount: wonByAgentMap.get(activityItem.userId) ?? 0,
    }));

    return {
      byStage,
      totalLeads,
      conversionRate: Number(conversionRate.toFixed(2)),
      avgHoursToClose: Number(avgHoursToClose.toFixed(2)),
      activityByAgent,
    };
  }

  private mapPreferenceToPropertyType(
    preference?: InterestedPropertyType,
  ): PropertyType | null {
    if (!preference) return null;
    if (preference === InterestedPropertyType.APARTMENT)
      return PropertyType.APARTMENT;
    if (preference === InterestedPropertyType.HOUSE) return PropertyType.HOUSE;
    return null;
  }

  private async validateDuplicates(
    companyId: string,
    phone?: string,
    email?: string,
    excludeId?: string,
  ): Promise<void> {
    if (!phone && !email) {
      return;
    }

    const query = this.interestedRepository
      .createQueryBuilder('interested')
      .where('interested.company_id = :companyId', { companyId })
      .andWhere('interested.deleted_at IS NULL');

    if (excludeId) {
      query.andWhere('interested.id != :excludeId', { excludeId });
    }

    if (phone && email) {
      query.andWhere(
        '(interested.phone = :phone OR interested.email = :email)',
        {
          phone,
          email,
        },
      );
    } else if (phone) {
      query.andWhere('interested.phone = :phone', { phone });
    } else if (email) {
      query.andWhere('interested.email = :email', { email });
    }

    const duplicate = await query.getOne();
    if (duplicate) {
      throw new ConflictException(
        'Potential duplicate detected by phone or email',
      );
    }
  }

  private calculateMatchScore(
    profile: InterestedProfile,
    property: Property,
  ): number {
    let score = 35;

    if (profile.propertyTypePreference) {
      const mappedType = this.mapPreferenceToPropertyType(
        profile.propertyTypePreference,
      );
      if (mappedType && property.propertyType === mappedType) {
        score += 25;
      }
    }

    if (
      profile.operation === InterestedOperation.SALE &&
      profile.maxAmount &&
      property.salePrice
    ) {
      const diff = Math.max(
        0,
        Number(property.salePrice) - Number(profile.maxAmount),
      );
      score += diff === 0 ? 25 : Math.max(0, 25 - diff / 10000);
    }

    if (profile.peopleCount && property.maxOccupants) {
      if (property.maxOccupants >= profile.peopleCount) {
        score += 10;
      }
    }

    if (profile.hasPets && property.allowsPets) {
      score += 5;
    }

    return Number(Math.min(100, score).toFixed(2));
  }

  private buildMatchReasons(
    profile: InterestedProfile,
    property: Property,
  ): string[] {
    const reasons: string[] = [];

    const mappedType = this.mapPreferenceToPropertyType(
      profile.propertyTypePreference,
    );
    if (mappedType && property.propertyType === mappedType) {
      reasons.push('Tipo de propiedad coincide');
    }

    if (
      profile.operation === InterestedOperation.SALE &&
      profile.maxAmount &&
      property.salePrice &&
      Number(property.salePrice) <= Number(profile.maxAmount)
    ) {
      reasons.push('Precio de venta dentro del rango');
    }

    if (
      profile.peopleCount &&
      property.maxOccupants &&
      property.maxOccupants >= profile.peopleCount
    ) {
      reasons.push('Capacidad adecuada');
    }

    if (profile.hasPets && property.allowsPets) {
      reasons.push('Acepta mascotas');
    }

    if (reasons.length === 0) {
      reasons.push('Coincidencia parcial de criterios');
    }

    return reasons;
  }

  private resolveName(profile: InterestedProfile): {
    firstName: string;
    lastName: string;
    fullName: string;
  } {
    const firstName =
      (profile.firstName ?? 'Interesado').trim() || 'Interesado';
    const lastName = (profile.lastName ?? 'CRM').trim() || 'CRM';
    return {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
    };
  }

  private buildFallbackEmail(profile: InterestedProfile): string {
    const phone = profile.phone.replace(/\D+/g, '');
    return `interesado.${phone || profile.id}@rentflow.local`;
  }

  private generateRandomPassword(): string {
    return `Tmp!${Math.random().toString(36).slice(2, 10)}1`;
  }
}
