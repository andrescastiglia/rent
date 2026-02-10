import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Owner } from './entities/owner.entity';
import {
  OwnerActivity,
  OwnerActivityStatus,
} from './entities/owner-activity.entity';
import { Property } from '../properties/entities/property.entity';
import { CreateOwnerActivityDto } from './dto/create-owner-activity.dto';
import { UpdateOwnerActivityDto } from './dto/update-owner-activity.dto';

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
