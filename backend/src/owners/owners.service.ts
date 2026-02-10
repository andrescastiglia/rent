import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Owner } from './entities/owner.entity';
import {
  OwnerActivity,
  OwnerActivityStatus,
} from './entities/owner-activity.entity';
import { Property } from '../properties/entities/property.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateOwnerActivityDto } from './dto/create-owner-activity.dto';
import { UpdateOwnerActivityDto } from './dto/update-owner-activity.dto';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';

interface UserContext {
  id: string;
  companyId: string;
}

@Injectable()
export class OwnersService {
  constructor(
    @InjectRepository(Owner)
    private readonly ownersRepository: Repository<Owner>,
    @InjectRepository(OwnerActivity)
    private readonly ownerActivitiesRepository: Repository<OwnerActivity>,
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Get all owners for a company.
   * @param companyId - Company ID
   * @returns List of owners with user data
   */
  async findAll(companyId: string): Promise<Owner[]> {
    return this.ownersRepository.find({
      where: { companyId, deletedAt: IsNull() },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get owner by ID.
   * @param id - Owner ID
   * @param companyId - Company ID for security
   * @returns Owner with user data
   */
  async findOne(id: string, companyId: string): Promise<Owner> {
    const owner = await this.ownersRepository.findOne({
      where: { id, companyId, deletedAt: IsNull() },
      relations: ['user'],
    });

    if (!owner) {
      throw new NotFoundException(`Owner with ID ${id} not found`);
    }

    return owner;
  }

  /**
   * Get owner by user ID.
   * @param userId - User ID
   * @param companyId - Company ID for security
   * @returns Owner with user data
   */
  async findByUserId(userId: string, companyId: string): Promise<Owner | null> {
    return this.ownersRepository.findOne({
      where: { userId, companyId, deletedAt: IsNull() },
      relations: ['user'],
    });
  }

  async create(dto: CreateOwnerDto, companyId: string): Promise<Owner> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existingUser = await this.usersRepository.findOne({
      where: { email: normalizedEmail, deletedAt: IsNull() },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const password = dto.password?.trim() || randomBytes(16).toString('hex');
    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(password, salt);

    const ownerId = await this.dataSource.transaction(async (manager) => {
      const user = manager.getRepository(User).create({
        companyId,
        role: UserRole.OWNER,
        email: normalizedEmail,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim() || undefined,
        isActive: true,
      });

      const savedUser = await manager.getRepository(User).save(user);

      const owner = manager.getRepository(Owner).create({
        userId: savedUser.id,
        companyId,
        taxId: dto.taxId?.trim() || undefined,
        taxIdType: dto.taxIdType?.trim() || undefined,
        address: dto.address?.trim() || undefined,
        city: dto.city?.trim() || undefined,
        state: dto.state?.trim() || undefined,
        country: dto.country?.trim() || undefined,
        postalCode: dto.postalCode?.trim() || undefined,
        bankName: dto.bankName?.trim() || undefined,
        bankAccountType: dto.bankAccountType?.trim() || undefined,
        bankAccountNumber: dto.bankAccountNumber?.trim() || undefined,
        bankCbu: dto.bankCbu?.trim() || undefined,
        bankAlias: dto.bankAlias?.trim() || undefined,
        paymentMethod: dto.paymentMethod,
        commissionRate: dto.commissionRate,
        notes: dto.notes?.trim() || undefined,
      });

      const savedOwner = await manager.getRepository(Owner).save(owner);
      return savedOwner.id;
    });

    return this.findOne(ownerId, companyId);
  }

  async update(
    id: string,
    dto: UpdateOwnerDto,
    companyId: string,
  ): Promise<Owner> {
    const owner = await this.findOne(id, companyId);

    if (dto.email) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      if (normalizedEmail !== owner.user.email) {
        const existingUser = await this.usersRepository.findOne({
          where: { email: normalizedEmail, deletedAt: IsNull() },
        });
        if (existingUser && existingUser.id !== owner.userId) {
          throw new ConflictException('A user with this email already exists');
        }
      }
      owner.user.email = normalizedEmail;
    }

    if (dto.firstName !== undefined) {
      owner.user.firstName = dto.firstName.trim();
    }
    if (dto.lastName !== undefined) {
      owner.user.lastName = dto.lastName.trim();
    }
    if (dto.phone !== undefined) {
      owner.user.phone = dto.phone.trim();
    }

    await this.usersRepository.save(owner.user);

    if (dto.taxId !== undefined) owner.taxId = dto.taxId.trim();
    if (dto.taxIdType !== undefined) owner.taxIdType = dto.taxIdType.trim();
    if (dto.address !== undefined) owner.address = dto.address.trim();
    if (dto.city !== undefined) owner.city = dto.city.trim();
    if (dto.state !== undefined) owner.state = dto.state.trim();
    if (dto.country !== undefined) owner.country = dto.country.trim();
    if (dto.postalCode !== undefined) owner.postalCode = dto.postalCode.trim();
    if (dto.bankName !== undefined) owner.bankName = dto.bankName.trim();
    if (dto.bankAccountType !== undefined)
      owner.bankAccountType = dto.bankAccountType.trim();
    if (dto.bankAccountNumber !== undefined)
      owner.bankAccountNumber = dto.bankAccountNumber.trim();
    if (dto.bankCbu !== undefined) owner.bankCbu = dto.bankCbu.trim();
    if (dto.bankAlias !== undefined) owner.bankAlias = dto.bankAlias.trim();
    if (dto.paymentMethod !== undefined)
      owner.paymentMethod = dto.paymentMethod;
    if (dto.commissionRate !== undefined)
      owner.commissionRate = dto.commissionRate;
    if (dto.notes !== undefined) owner.notes = dto.notes.trim();

    await this.ownersRepository.save(owner);

    return this.findOne(id, companyId);
  }

  async listActivities(
    ownerId: string,
    companyId: string,
  ): Promise<OwnerActivity[]> {
    await this.findOne(ownerId, companyId);

    return this.ownerActivitiesRepository.find({
      where: {
        ownerId,
        companyId,
        deletedAt: IsNull(),
      },
      relations: ['property'],
      order: { createdAt: 'DESC' },
    });
  }

  async createActivity(
    ownerId: string,
    dto: CreateOwnerActivityDto,
    user: UserContext,
  ): Promise<OwnerActivity> {
    await this.findOne(ownerId, user.companyId);

    if (dto.propertyId) {
      const property = await this.propertiesRepository.findOne({
        where: {
          id: dto.propertyId,
          ownerId,
          companyId: user.companyId,
          deletedAt: IsNull(),
        },
      });
      if (!property) {
        throw new NotFoundException('Property not found for this owner');
      }
    }

    const activity = this.ownerActivitiesRepository.create({
      companyId: user.companyId,
      ownerId,
      propertyId: dto.propertyId ?? null,
      type: dto.type,
      status: dto.status ?? OwnerActivityStatus.PENDING,
      subject: dto.subject,
      body: dto.body ?? null,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      completedAt: dto.completedAt ? new Date(dto.completedAt) : null,
      metadata: dto.metadata ?? {},
      createdByUserId: user.id,
    });

    if (
      activity.status === OwnerActivityStatus.COMPLETED &&
      !activity.completedAt
    ) {
      activity.completedAt = new Date();
    }

    return this.ownerActivitiesRepository.save(activity);
  }

  async updateActivity(
    ownerId: string,
    activityId: string,
    dto: UpdateOwnerActivityDto,
    companyId: string,
  ): Promise<OwnerActivity> {
    await this.findOne(ownerId, companyId);

    const activity = await this.ownerActivitiesRepository.findOne({
      where: { id: activityId, ownerId, companyId, deletedAt: IsNull() },
    });

    if (!activity) {
      throw new NotFoundException(
        `Owner activity with ID ${activityId} not found`,
      );
    }

    if (dto.propertyId) {
      const property = await this.propertiesRepository.findOne({
        where: {
          id: dto.propertyId,
          ownerId,
          companyId,
          deletedAt: IsNull(),
        },
      });
      if (!property) {
        throw new NotFoundException('Property not found for this owner');
      }
    }

    Object.assign(activity, {
      ...dto,
      propertyId: dto.propertyId ?? activity.propertyId,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : activity.dueAt,
      completedAt: dto.completedAt
        ? new Date(dto.completedAt)
        : activity.completedAt,
    });

    if (dto.status === OwnerActivityStatus.COMPLETED && !activity.completedAt) {
      activity.completedAt = new Date();
    }

    return this.ownerActivitiesRepository.save(activity);
  }
}
