import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { IsNull, Repository } from 'typeorm';
import { Buyer } from './entities/buyer.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateBuyerDto } from './dto/create-buyer.dto';
import { UpdateBuyerDto } from './dto/update-buyer.dto';
import { BuyerFiltersDto } from './dto/buyer-filters.dto';
import {
  InterestedProfile,
  InterestedStatus,
} from '../interested/entities/interested-profile.entity';

@Injectable()
export class BuyersService {
  constructor(
    @InjectRepository(Buyer)
    private readonly buyersRepository: Repository<Buyer>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(InterestedProfile)
    private readonly interestedProfilesRepository: Repository<InterestedProfile>,
  ) {}

  async findAll(
    filters: BuyerFiltersDto,
    companyId: string,
  ): Promise<{ data: Buyer[]; total: number; page: number; limit: number }> {
    const { name, email, phone, page = 1, limit = 100 } = filters;
    const query = this.buyersRepository
      .createQueryBuilder('buyer')
      .leftJoinAndSelect('buyer.user', 'user')
      .leftJoinAndSelect('buyer.interestedProfile', 'interestedProfile')
      .where('buyer.company_id = :companyId', { companyId })
      .andWhere('buyer.deleted_at IS NULL')
      .andWhere('user.deleted_at IS NULL');

    if (name) {
      query.andWhere(
        `unaccent(lower(
          coalesce(user.first_name, '') || ' ' || coalesce(user.last_name, '')
        )) LIKE unaccent(lower(:name))`,
        { name: `%${name}%` },
      );
    }

    if (email) {
      query.andWhere(
        `unaccent(lower(coalesce(user.email, ''))) LIKE unaccent(lower(:email))`,
        { email: `%${email}%` },
      );
    }

    if (phone) {
      query.andWhere(`lower(coalesce(user.phone, '')) LIKE lower(:phone)`, {
        phone: `%${phone}%`,
      });
    }

    query
      .orderBy('buyer.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOne(
    id: string,
    companyId: string,
    userId?: string,
  ): Promise<Buyer> {
    const buyer = await this.buyersRepository.findOne({
      where: {
        id,
        companyId,
        ...(userId ? { userId } : {}),
        deletedAt: IsNull(),
      },
      relations: ['user', 'interestedProfile'],
    });

    if (!buyer) {
      throw new NotFoundException(`Buyer with ID ${id} not found`);
    }

    return buyer;
  }

  async create(dto: CreateBuyerDto, companyId: string): Promise<Buyer> {
    const email = this.normalizeEmail(dto.email);
    if (email) {
      const existingUser = await this.usersRepository.findOne({
        where: { email },
      });
      if (existingUser) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    const interestedProfile = dto.interestedProfileId
      ? await this.interestedProfilesRepository.findOne({
          where: {
            id: dto.interestedProfileId,
            companyId,
            deletedAt: IsNull(),
          },
        })
      : null;

    if (dto.interestedProfileId && !interestedProfile) {
      throw new NotFoundException('Interested profile not found');
    }
    if (
      interestedProfile?.convertedToBuyerId &&
      interestedProfile.convertedToBuyerId.trim().length > 0
    ) {
      throw new ConflictException(
        'Interested profile is already linked to another buyer',
      );
    }

    const password = dto.password?.trim() || randomBytes(16).toString('hex');
    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(password, salt);

    const user = this.usersRepository.create({
      companyId,
      email,
      passwordHash,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      phone: dto.phone?.trim() || null,
      role: UserRole.BUYER,
      isActive: true,
    });

    const savedUser = await this.usersRepository.save(user);
    const buyer = this.buyersRepository.create({
      userId: savedUser.id,
      companyId,
      interestedProfileId: interestedProfile?.id ?? null,
      dni: dto.dni?.trim() || null,
      notes: dto.notes?.trim() || null,
    });

    const savedBuyer = await this.buyersRepository.save(buyer);

    if (interestedProfile) {
      interestedProfile.convertedToBuyerId = savedBuyer.id;
      interestedProfile.status = InterestedStatus.BUYER;
      await this.interestedProfilesRepository.save(interestedProfile);
    }

    return this.findOne(savedBuyer.id, companyId);
  }

  async update(
    id: string,
    dto: UpdateBuyerDto,
    companyId: string,
  ): Promise<Buyer> {
    const buyer = await this.findOne(id, companyId);
    const nextEmail =
      dto.email === undefined ? undefined : this.normalizeEmail(dto.email);
    const previousInterestedProfileId = buyer.interestedProfileId;
    const nextInterestedProfile = await this.resolveNextInterestedProfile(
      dto.interestedProfileId,
      companyId,
      buyer.id,
    );

    if (nextEmail) {
      const existingUser = await this.usersRepository.findOne({
        where: { email: nextEmail },
      });
      if (existingUser && existingUser.id !== buyer.userId) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    if (dto.firstName !== undefined) {
      buyer.user.firstName = dto.firstName.trim();
    }
    if (dto.lastName !== undefined) {
      buyer.user.lastName = dto.lastName.trim();
    }
    if (dto.email !== undefined) {
      buyer.user.email = nextEmail ?? null;
    }
    if (dto.phone !== undefined) {
      buyer.user.phone = dto.phone?.trim() || null;
    }

    if (dto.interestedProfileId !== undefined) {
      buyer.interestedProfileId = nextInterestedProfile?.id ?? null;
    }

    if (dto.dni !== undefined) {
      buyer.dni = dto.dni?.trim() || null;
    }

    if (dto.notes !== undefined) {
      buyer.notes = dto.notes?.trim() || null;
    }

    await this.usersRepository.save(buyer.user);
    await this.buyersRepository.save(buyer);

    await this.syncInterestedProfileLinks(
      previousInterestedProfileId,
      buyer.interestedProfileId,
      buyer.id,
      companyId,
      nextInterestedProfile,
    );

    return this.findOne(id, companyId);
  }

  private async resolveNextInterestedProfile(
    interestedProfileId: string | null | undefined,
    companyId: string,
    buyerId: string,
  ): Promise<InterestedProfile | null | undefined> {
    if (interestedProfileId === undefined) {
      return undefined;
    }

    if (!interestedProfileId) {
      return null;
    }

    const interestedProfile = await this.findInterestedProfileOrThrow(
      interestedProfileId,
      companyId,
    );

    if (
      interestedProfile.convertedToBuyerId &&
      interestedProfile.convertedToBuyerId !== buyerId
    ) {
      throw new ConflictException(
        'Interested profile is already linked to another buyer',
      );
    }

    return interestedProfile;
  }

  private async findInterestedProfileOrThrow(
    interestedProfileId: string,
    companyId: string,
  ): Promise<InterestedProfile> {
    const interestedProfile = await this.interestedProfilesRepository.findOne({
      where: {
        id: interestedProfileId,
        companyId,
        deletedAt: IsNull(),
      },
    });

    if (!interestedProfile) {
      throw new NotFoundException('Interested profile not found');
    }

    return interestedProfile;
  }

  private async syncInterestedProfileLinks(
    previousInterestedProfileId: string | null,
    currentInterestedProfileId: string | null,
    buyerId: string,
    companyId: string,
    nextInterestedProfile?: InterestedProfile | null,
  ): Promise<void> {
    if (
      previousInterestedProfileId &&
      previousInterestedProfileId !== currentInterestedProfileId
    ) {
      const previousInterestedProfile =
        await this.interestedProfilesRepository.findOne({
          where: {
            id: previousInterestedProfileId,
            companyId,
            deletedAt: IsNull(),
          },
        });

      if (previousInterestedProfile?.convertedToBuyerId === buyerId) {
        previousInterestedProfile.convertedToBuyerId = null;
        previousInterestedProfile.status =
          this.resolveInterestedStatusWithoutBuyer(previousInterestedProfile);
        await this.interestedProfilesRepository.save(previousInterestedProfile);
      }
    }

    if (!currentInterestedProfileId) {
      return;
    }

    const linkedInterestedProfile =
      nextInterestedProfile ??
      (await this.interestedProfilesRepository.findOne({
        where: {
          id: currentInterestedProfileId,
          companyId,
          deletedAt: IsNull(),
        },
      }));

    if (!linkedInterestedProfile) {
      return;
    }

    linkedInterestedProfile.convertedToBuyerId = buyerId;
    linkedInterestedProfile.status = InterestedStatus.BUYER;
    await this.interestedProfilesRepository.save(linkedInterestedProfile);
  }

  private resolveInterestedStatusWithoutBuyer(
    interestedProfile: InterestedProfile,
  ): InterestedStatus {
    if (interestedProfile.convertedToTenantId) {
      return InterestedStatus.TENANT;
    }

    if (interestedProfile.convertedToSaleAgreementId) {
      return InterestedStatus.BUYER;
    }

    return InterestedStatus.INTERESTED;
  }

  private normalizeEmail(email: string | null | undefined): string | null {
    const normalized = email?.trim().toLowerCase() ?? '';
    return normalized || null;
  }
}
