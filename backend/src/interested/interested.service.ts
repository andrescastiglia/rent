import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { I18nContext, I18nService } from 'nestjs-i18n';
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
  PropertyOperation,
  PropertyOperationState,
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
import {
  PropertyReservation,
  PropertyReservationStatus,
} from './entities/property-reservation.entity';
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
import { CreatePropertyReservationDto } from './dto/create-property-reservation.dto';

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
    @InjectRepository(PropertyReservation)
    private readonly reservationRepository: Repository<PropertyReservation>,
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
    private readonly i18n: I18nService,
  ) {}

  async create(
    dto: CreateInterestedProfileDto,
    user: UserContext,
  ): Promise<InterestedProfile> {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }

    await this.validateDuplicates(user.companyId, dto.phone, dto.email);

    const normalizedOperations = this.normalizeOperations(
      dto.operations,
      dto.operation,
    );

    const profile = this.interestedRepository.create({
      ...dto,
      companyId: user.companyId,
      operation: normalizedOperations.primaryOperation,
      operations: normalizedOperations.operations,
      status: dto.status ?? InterestedStatus.INTERESTED,
    });
    const created = await this.interestedRepository.save(profile);

    await this.stageHistoryRepository.save(
      this.stageHistoryRepository.create({
        interestedProfileId: created.id,
        fromStatus: created.status,
        toStatus: created.status,
        reason: this.t('interested.reasons.leadCreated'),
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
      query.andWhere(
        '((interested.operations IS NOT NULL AND :operation = ANY(interested.operations)) OR interested.operation = :operation)',
        { operation },
      );
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
    const normalizedOperations =
      dto.operations !== undefined || dto.operation !== undefined
        ? this.normalizeOperations(
            dto.operations,
            dto.operation,
            profile.operations,
            profile.operation,
          )
        : null;

    Object.assign(profile, dto);
    if (normalizedOperations) {
      profile.operation = normalizedOperations.primaryOperation;
      profile.operations = normalizedOperations.operations;
    }
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
      .leftJoinAndSelect('property.features', 'features')
      .where('property.deleted_at IS NULL')
      .andWhere('property.company_id = :companyId', {
        companyId: profile.companyId,
      })
      .andWhere('property.status = :status', { status: PropertyStatus.ACTIVE })
      .andWhere('property.operation_state = :operationState', {
        operationState: PropertyOperationState.AVAILABLE,
      });

    const propertyType = this.mapPreferenceToPropertyType(
      profile.propertyTypePreference,
    );
    if (propertyType) {
      query.andWhere('property.property_type = :propertyType', {
        propertyType,
      });
    }

    const properties = await query.getMany();

    return properties
      .filter((property) => this.isOperationCompatible(profile, property))
      .map((property) => ({
        property,
        score: this.calculateMatchScore(profile, property),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.property);
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

    const matchedPropertyIds = new Set(
      properties.map((property) => property.id),
    );
    const staleMatchIds = existing
      .filter((item) => !matchedPropertyIds.has(item.propertyId))
      .map((item) => item.id);

    if (staleMatchIds.length > 0) {
      await this.matchRepository.softDelete(staleMatchIds);
    }

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

    if (toSave.length > 0) {
      await this.matchRepository.save(toSave);
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
          subject: this.t('interested.activities.matchContactSubject'),
          body: this.t('interested.activities.matchContactBody', {
            propertyId: match.propertyId,
          }),
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

    const validTransition =
      fromStatus === InterestedStatus.INTERESTED &&
      (dto.toStatus === InterestedStatus.TENANT ||
        dto.toStatus === InterestedStatus.BUYER);
    if (!validTransition) {
      throw new ConflictException(
        'Interested stage can only move from interested to tenant or buyer',
      );
    }

    if (dto.toStatus === InterestedStatus.TENANT) {
      if (!profile.convertedToTenantId) {
        const converted = await this.convertToTenant(id, {}, user);
        if (dto.reason) {
          await this.createActivity(
            id,
            {
              type: InterestedActivityType.NOTE,
              subject: this.t('interested.activities.closeRentSubject'),
              body: dto.reason,
              status: InterestedActivityStatus.COMPLETED,
              completedAt: new Date().toISOString(),
            },
            user,
          );
        }
        return converted.profile;
      }

      profile.status = InterestedStatus.TENANT;
      const updated = await this.interestedRepository.save(profile);

      await this.stageHistoryRepository.save(
        this.stageHistoryRepository.create({
          interestedProfileId: id,
          fromStatus,
          toStatus: InterestedStatus.TENANT,
          reason: dto.reason ?? this.t('interested.reasons.convertedToTenant'),
          changedByUserId: user.id,
        }),
      );

      return updated;
    }

    profile.status = InterestedStatus.BUYER;

    const updated = await this.interestedRepository.save(profile);

    await this.stageHistoryRepository.save(
      this.stageHistoryRepository.create({
        interestedProfileId: id,
        fromStatus,
        toStatus: InterestedStatus.BUYER,
        reason: dto.reason ?? this.t('interested.reasons.convertedToBuyer'),
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
    activity.metadata = {
      ...(dto.metadata ?? {}), // NOSONAR
      ...(dto.propertyId ? { propertyId: dto.propertyId } : {}),
    };
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

    if (dto.markReserved && dto.propertyId) {
      await this.createReservation(
        id,
        {
          propertyId: dto.propertyId,
          notes: dto.body,
          activitySource: 'activity',
        },
        user,
      );
    }

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

  async createReservation(
    id: string,
    dto: CreatePropertyReservationDto,
    user: UserContext,
  ): Promise<PropertyReservation> {
    const profile = await this.findOne(id, user);

    const property = await this.propertiesRepository.findOne({
      where: {
        id: dto.propertyId,
        companyId: profile.companyId,
        deletedAt: IsNull(),
      },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const existing = await this.reservationRepository.findOne({
      where: {
        companyId: profile.companyId,
        propertyId: property.id,
        interestedProfileId: profile.id,
        status: PropertyReservationStatus.ACTIVE,
        deletedAt: IsNull(),
      },
    });
    if (existing) {
      return existing;
    }

    const reservation = this.reservationRepository.create({
      companyId: profile.companyId,
      propertyId: property.id,
      interestedProfileId: profile.id,
      status: PropertyReservationStatus.ACTIVE,
      activitySource: dto.activitySource ?? 'activity',
      notes: dto.notes ?? null,
      reservedByUserId: user.id,
      reservedAt: new Date(),
    });

    const saved = await this.reservationRepository.save(reservation);

    await this.propertiesRepository.update(property.id, {
      operationState: PropertyOperationState.RESERVED,
    });

    await this.createActivity(
      profile.id,
      {
        type: InterestedActivityType.NOTE,
        subject: this.t('interested.activities.reserveSubject'),
        body:
          dto.notes ??
          this.t('interested.activities.reserveBody', {
            propertyId: property.id,
          }),
        status: InterestedActivityStatus.COMPLETED,
        completedAt: new Date().toISOString(),
        metadata: { propertyId: property.id, reservationId: saved.id },
      },
      user,
    );

    return saved;
  }

  async listReservations(
    id: string,
    user: UserContext,
  ): Promise<PropertyReservation[]> {
    const profile = await this.findOne(id, user);

    return this.reservationRepository.find({
      where: {
        interestedProfileId: profile.id,
        companyId: profile.companyId,
        deletedAt: IsNull(),
      },
      relations: ['property'],
      order: { reservedAt: 'DESC' },
    });
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
      title: this.t('interested.timeline.stageTitle', {
        fromStatus: item.fromStatus,
        toStatus: item.toStatus,
      }),
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
      title: this.t('interested.timeline.activityTitle', {
        type: item.type.toUpperCase(),
        subject: item.subject,
      }),
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
      title: this.t('interested.timeline.matchTitle', {
        propertyName: item.property?.name ?? item.propertyId,
      }),
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
      title: this.t('interested.timeline.visitTitle', {
        propertyName: item.property?.name ?? item.propertyId,
      }),
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
      profile.status = InterestedStatus.TENANT;
      profile.qualificationLevel =
        profile.qualificationLevel ?? InterestedQualificationLevel.SQL;
      await manager.getRepository(InterestedProfile).save(profile);

      await manager.getRepository(InterestedStageHistory).save(
        manager.getRepository(InterestedStageHistory).create({
          interestedProfileId: profile.id,
          fromStatus: previousStatus,
          toStatus: InterestedStatus.TENANT,
          reason: this.t('interested.reasons.convertedToTenant'),
          changedByUserId: user.id,
        }),
      );

      await manager.getRepository(InterestedActivity).save(
        manager.getRepository(InterestedActivity).create({
          interestedProfileId: profile.id,
          type: InterestedActivityType.NOTE,
          status: InterestedActivityStatus.COMPLETED,
          subject: this.t('interested.activities.convertedToTenantSubject'),
          body: this.t('interested.activities.convertedToTenantBody', {
            tenantId: createdTenant.id,
            userEmail: createdUser.email,
          }),
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
    profile.status = InterestedStatus.BUYER;
    await this.interestedRepository.save(profile);

    await this.stageHistoryRepository.save(
      this.stageHistoryRepository.create({
        interestedProfileId: profile.id,
        fromStatus: previousStatus,
        toStatus: InterestedStatus.BUYER,
        reason: this.t('interested.reasons.convertedToBuyer'),
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
      .innerJoin(
        InterestedProfile,
        'profile',
        'profile.id = activity.interested_profile_id',
      )
      .where('activity.created_by_user_id IS NOT NULL')
      .andWhere('profile.company_id = :companyId', {
        companyId: user.companyId,
      })
      .andWhere('profile.deleted_at IS NULL')
      .groupBy('activity.created_by_user_id')
      .getRawMany<{ userId: string; activityCount: string }>();

    const convertedByAgentRaw = await this.stageHistoryRepository
      .createQueryBuilder('history')
      .select('history.changed_by_user_id', 'userId')
      .addSelect('COUNT(*)', 'wonCount')
      .innerJoin(
        InterestedProfile,
        'profile',
        'profile.id = history.interested_profile_id',
      )
      .where('history.to_status IN (:...convertedStatuses)', {
        convertedStatuses: [InterestedStatus.TENANT, InterestedStatus.BUYER],
      })
      .andWhere('history.changed_by_user_id IS NOT NULL')
      .andWhere('profile.company_id = :companyId', {
        companyId: user.companyId,
      })
      .andWhere('profile.deleted_at IS NULL')
      .groupBy('history.changed_by_user_id')
      .getRawMany<{ userId: string; wonCount: string }>();

    const byStage: Record<string, number> = {};
    for (const profile of profiles) {
      byStage[profile.status] = (byStage[profile.status] ?? 0) + 1;
    }

    const totalLeads = profiles.length;
    const convertedCount =
      (byStage[InterestedStatus.TENANT] ?? 0) +
      (byStage[InterestedStatus.BUYER] ?? 0);
    const conversionRate =
      totalLeads > 0 ? (convertedCount / totalLeads) * 100 : 0;

    const convertedProfiles = profiles.filter(
      (profile) =>
        profile.status === InterestedStatus.TENANT ||
        profile.status === InterestedStatus.BUYER,
    );
    const avgHoursToClose =
      convertedProfiles.length > 0
        ? convertedProfiles.reduce((acc, profile) => {
            const createdAt = profile.createdAt.getTime();
            const updatedAt = profile.updatedAt.getTime();
            return acc + (updatedAt - createdAt) / (1000 * 60 * 60);
          }, 0) / convertedProfiles.length
        : 0;

    const wonByAgentMap = new Map<string, number>(
      convertedByAgentRaw.map((item) => [item.userId, Number(item.wonCount)]),
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
    if (preference === InterestedPropertyType.APARTMENT) {
      return PropertyType.APARTMENT;
    }
    if (preference === InterestedPropertyType.HOUSE) {
      return PropertyType.HOUSE;
    }
    if (preference === InterestedPropertyType.COMMERCIAL) {
      return PropertyType.COMMERCIAL;
    }
    if (preference === InterestedPropertyType.OFFICE) {
      return PropertyType.OFFICE;
    }
    if (preference === InterestedPropertyType.WAREHOUSE) {
      return PropertyType.WAREHOUSE;
    }
    if (preference === InterestedPropertyType.LAND) {
      return PropertyType.LAND;
    }
    if (preference === InterestedPropertyType.PARKING) {
      return PropertyType.PARKING;
    }
    if (preference === InterestedPropertyType.OTHER) {
      return PropertyType.OTHER;
    }
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

  private normalizeOperations(
    operations?: InterestedOperation[],
    operation?: InterestedOperation,
    fallbackOperations?: InterestedOperation[],
    fallbackOperation?: InterestedOperation,
  ): {
    operations: InterestedOperation[];
    primaryOperation: InterestedOperation;
  } {
    const normalized = (operations ?? [])
      .filter((item): item is InterestedOperation => !!item)
      .filter((item, index, list) => list.indexOf(item) === index);

    if (normalized.length > 0) {
      return {
        operations: normalized,
        primaryOperation: normalized[0],
      };
    }

    if (operation) {
      return {
        operations: [operation],
        primaryOperation: operation,
      };
    }

    const fallbackNormalized = (fallbackOperations ?? [])
      .filter((item): item is InterestedOperation => !!item)
      .filter((item, index, list) => list.indexOf(item) === index);
    if (fallbackNormalized.length > 0) {
      return {
        operations: fallbackNormalized,
        primaryOperation:
          fallbackOperation && fallbackNormalized.includes(fallbackOperation)
            ? fallbackOperation
            : fallbackNormalized[0],
      };
    }

    if (fallbackOperation) {
      return {
        operations: [fallbackOperation],
        primaryOperation: fallbackOperation,
      };
    }

    return {
      operations: [InterestedOperation.RENT],
      primaryOperation: InterestedOperation.RENT,
    };
  }

  private resolveProfileOperations(
    profile: InterestedProfile,
  ): InterestedOperation[] {
    const normalized = this.normalizeOperations(
      profile.operations,
      profile.operation,
    );
    return normalized.operations;
  }

  private resolvePropertyOperations(property: Property): PropertyOperation[] {
    const fromProperty = (property.operations ?? [])
      .filter((item): item is PropertyOperation => !!item)
      .filter((item, index, list) => list.indexOf(item) === index);

    if (fromProperty.length > 0) {
      return fromProperty;
    }

    const hasRentPrice = this.getAvailableRentPrice(property) !== null;
    const hasSalePrice =
      property.salePrice !== null && property.salePrice !== undefined;

    if (hasRentPrice && hasSalePrice) {
      return [PropertyOperation.RENT, PropertyOperation.SALE];
    }
    if (hasSalePrice) {
      return [PropertyOperation.SALE];
    }
    if (hasRentPrice) {
      return [PropertyOperation.RENT];
    }
    return [PropertyOperation.RENT];
  }

  private isOperationCompatible(
    profile: InterestedProfile,
    property: Property,
  ): boolean {
    const desired = this.resolveProfileOperations(profile);
    if (desired.length === 0) {
      return true;
    }

    const offered = this.resolvePropertyOperations(property);
    const hasRentPrice = this.getAvailableRentPrice(property) !== null;
    const hasSalePrice =
      property.salePrice !== null && property.salePrice !== undefined;

    return desired.some((operation) => {
      if (operation === InterestedOperation.RENT) {
        return offered.includes(PropertyOperation.RENT) && hasRentPrice;
      }

      if (operation === InterestedOperation.SALE) {
        return offered.includes(PropertyOperation.SALE) && hasSalePrice;
      }

      return false;
    });
  }

  private getComparablePrices(
    profile: InterestedProfile,
    property: Property,
  ): number[] {
    const desired = this.resolveProfileOperations(profile);
    const offered = this.resolvePropertyOperations(property);
    const prices: number[] = [];

    const rentPrice = this.getAvailableRentPrice(property);
    const salePrice =
      property.salePrice === null || property.salePrice === undefined
        ? null
        : Number(property.salePrice);

    desired.forEach((operation) => {
      if (
        operation === InterestedOperation.RENT &&
        offered.includes(PropertyOperation.RENT) &&
        rentPrice !== null
      ) {
        prices.push(rentPrice);
      }

      if (
        operation === InterestedOperation.SALE &&
        offered.includes(PropertyOperation.SALE) &&
        salePrice !== null
      ) {
        prices.push(salePrice);
      }
    });

    return prices;
  }

  private calculateMatchScore(
    profile: InterestedProfile,
    property: Property,
  ): number {
    let totalWeight = 0;
    let matchedWeight = 0;

    const addCriterion = (
      enabled: boolean,
      matched: boolean,
      weight: number,
    ) => {
      if (!enabled) {
        return;
      }
      totalWeight += weight;
      if (matched) {
        matchedWeight += weight;
      }
    };

    const profileOperations = this.resolveProfileOperations(profile);
    const operationMatches = this.isOperationCompatible(profile, property);
    addCriterion(profileOperations.length > 0, operationMatches, 20);

    const mappedType = this.mapPreferenceToPropertyType(
      profile.propertyTypePreference,
    );
    addCriterion(
      !!mappedType,
      !!mappedType && property.propertyType === mappedType,
      15,
    );

    const preferredCity = profile.preferredCity?.trim().toLowerCase();
    const propertyCity = property.addressCity?.trim().toLowerCase() ?? '';
    addCriterion(
      !!preferredCity,
      !!preferredCity && propertyCity === preferredCity,
      10,
    );

    const preferredZones = (profile.preferredZones ?? [])
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);
    const propertyLocation = [
      property.addressCity,
      property.addressState,
      property.addressStreet,
      property.addressPostalCode,
    ]
      .filter((item) => !!item)
      .join(' ')
      .toLowerCase();
    addCriterion(
      preferredZones.length > 0,
      preferredZones.length > 0 && // NOSONAR
        preferredZones.some((zone) => propertyLocation.includes(zone)),
      10,
    );

    const hasMinAmount =
      profile.minAmount !== null && profile.minAmount !== undefined;
    const hasMaxAmount =
      profile.maxAmount !== null && profile.maxAmount !== undefined;
    addCriterion(
      hasMinAmount || hasMaxAmount,
      this.isPriceInRange(profile, property),
      20,
    );

    addCriterion(
      profile.peopleCount !== null && profile.peopleCount !== undefined,
      this.hasEnoughOccupants(profile, property),
      10,
    );

    addCriterion(profile.hasPets === true, property.allowsPets === true, 5);
    addCriterion(
      (profile.guaranteeTypes ?? []).length > 0,
      this.matchesGuaranteeTypes(profile, property),
      5,
    );

    const desiredFeatures = (profile.desiredFeatures ?? [])
      .map((feature) => feature.trim().toLowerCase())
      .filter((feature) => feature.length > 0);
    addCriterion(
      desiredFeatures.length > 0,
      this.matchesDesiredFeatures(desiredFeatures, property),
      5,
    );

    if (totalWeight === 0) {
      return 0;
    }

    return Number(((matchedWeight / totalWeight) * 100).toFixed(2));
  }

  private buildMatchReasons(
    profile: InterestedProfile,
    property: Property,
  ): string[] {
    const reasons: string[] = [];
    if (this.isOperationCompatible(profile, property)) {
      reasons.push(this.t('interested.matchReasons.operationMatches'));
    }

    const mappedType = this.mapPreferenceToPropertyType(
      profile.propertyTypePreference,
    );
    if (mappedType && property.propertyType === mappedType) {
      reasons.push(this.t('interested.matchReasons.propertyTypeMatches'));
    }

    if (this.isPriceInRange(profile, property)) {
      reasons.push(this.t('interested.matchReasons.priceWithinRange'));
    }

    if (this.hasEnoughOccupants(profile, property)) {
      reasons.push(this.t('interested.matchReasons.capacityAdequate'));
    }

    if (profile.hasPets && property.allowsPets) {
      reasons.push(this.t('interested.matchReasons.petsAllowed'));
    }

    if (
      profile.preferredCity &&
      property.addressCity && // NOSONAR
      profile.preferredCity.trim().toLowerCase() ===
        property.addressCity.trim().toLowerCase()
    ) {
      reasons.push(this.t('interested.matchReasons.cityMatches'));
    }

    const desiredFeatures = (profile.desiredFeatures ?? [])
      .map((feature) => feature.trim().toLowerCase())
      .filter((feature) => feature.length > 0);
    if (
      desiredFeatures.length > 0 &&
      this.matchesDesiredFeatures(desiredFeatures, property)
    ) {
      reasons.push(this.t('interested.matchReasons.featuresMatch'));
    }

    if (this.matchesGuaranteeTypes(profile, property)) {
      reasons.push(this.t('interested.matchReasons.guaranteeMatches'));
    }

    if (reasons.length === 0) {
      reasons.push(this.t('interested.matchReasons.partialMatch'));
    }

    return reasons;
  }

  private resolveName(profile: InterestedProfile): {
    firstName: string;
    lastName: string;
    fullName: string;
  } {
    const firstName =
      (
        profile.firstName ?? this.t('interested.names.defaultFirstName')
      ).trim() || this.t('interested.names.defaultFirstName');
    const lastName =
      (profile.lastName ?? this.t('interested.names.defaultLastName')).trim() ||
      this.t('interested.names.defaultLastName');
    return {
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
    };
  }

  private buildFallbackEmail(profile: InterestedProfile): string {
    const phone = profile.phone.replaceAll(/\D+/g, '');
    return `interesado.${phone || profile.id}@rentflow.local`;
  }

  private generateRandomPassword(): string {
    return `Tmp!${Math.random().toString(36).slice(2, 10)}1`;
  }

  private isPriceInRange(
    profile: InterestedProfile,
    property: Property,
  ): boolean {
    const minAmount =
      profile.minAmount === null || profile.minAmount === undefined
        ? null
        : Number(profile.minAmount);
    const maxAmount =
      profile.maxAmount === null || profile.maxAmount === undefined
        ? null
        : Number(profile.maxAmount);

    if (minAmount === null && maxAmount === null) {
      return true;
    }

    const prices = this.getComparablePrices(profile, property);
    if (prices.length === 0) {
      return false;
    }

    return prices.some((price) => {
      if (minAmount !== null && price < minAmount) {
        return false;
      }
      if (maxAmount !== null && price > maxAmount) {
        return false;
      }
      return true;
    });
  }

  private getAvailableRentPrice(property: Property): number | null {
    if (property.rentPrice !== null && property.rentPrice !== undefined) {
      return Number(property.rentPrice);
    }

    const availableRentValues = (property.units ?? [])
      .filter((unit) => unit.status === UnitStatus.AVAILABLE)
      .map((unit) =>
        unit.baseRent === null || unit.baseRent === undefined
          ? null
          : Number(unit.baseRent),
      )
      .filter((value): value is number => value !== null);

    if (availableRentValues.length === 0) {
      return null;
    }

    return Math.min(...availableRentValues);
  }

  private hasEnoughOccupants(
    profile: InterestedProfile,
    property: Property,
  ): boolean {
    if (profile.peopleCount === null || profile.peopleCount === undefined) {
      return true;
    }
    if (property.maxOccupants === null || property.maxOccupants === undefined) {
      return true;
    }
    return property.maxOccupants >= profile.peopleCount;
  }

  private matchesGuaranteeTypes(
    profile: InterestedProfile,
    property: Property,
  ): boolean {
    const desiredGuarantees = (profile.guaranteeTypes ?? [])
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);

    if (desiredGuarantees.length === 0) {
      return false;
    }

    const acceptedGuarantees = (property.acceptedGuaranteeTypes ?? [])
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);

    if (acceptedGuarantees.length === 0) {
      return true;
    }

    return desiredGuarantees.some((item) => acceptedGuarantees.includes(item));
  }

  private matchesDesiredFeatures(
    desiredFeatures: string[],
    property: Property,
  ): boolean {
    if (desiredFeatures.length === 0) {
      return true;
    }

    const searchableFeatures = this.buildPropertyFeaturePool(property);
    return desiredFeatures.every((feature) => searchableFeatures.has(feature));
  }

  private buildPropertyFeaturePool(property: Property): Set<string> {
    const pool = new Set<string>();

    (property.amenities ?? []).forEach((item) => {
      const normalized = item?.trim().toLowerCase();
      if (normalized) {
        pool.add(normalized);
      }
    });

    (property.features ?? []).forEach((feature) => {
      const name = feature.name?.trim().toLowerCase();
      const value = feature.value?.trim().toLowerCase();
      if (name) {
        pool.add(name);
      }
      if (value) {
        pool.add(value);
      }
      if (name && value) {
        pool.add(`${name}:${value}`);
      }
    });

    return pool;
  }

  private resolveSupportedLang(lang?: string): 'es' | 'en' | 'pt' {
    const normalizedLang = (lang ?? '').trim().toLowerCase();

    if (normalizedLang.startsWith('en')) {
      return 'en';
    }

    if (normalizedLang.startsWith('pt')) {
      return 'pt';
    }

    return 'es';
  }

  private t(key: string, args?: Record<string, unknown>): string {
    const lang = this.resolveSupportedLang(I18nContext.current()?.lang);
    const translated = this.i18n.t(key, { lang, args });
    const translatedText = typeof translated === 'string' ? translated : key;

    if (translatedText === key && lang !== 'es') {
      const fallback = this.i18n.t(key, { lang: 'es', args });
      return typeof fallback === 'string' ? fallback : key;
    }

    return translatedText;
  }
}
