import {
  BadRequestException,
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { BankAccount } from './entities/bank-account.entity';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { UserRole } from '../users/entities/user.entity';
import { Owner } from '../owners/entities/owner.entity';
import { Property } from '../properties/entities/property.entity';
import { User } from '../users/entities/user.entity';
import { hasRole, isAdminOrStaff } from '../common/helpers/role-scope.helper';

interface UserContext {
  id: string;
  companyId: string;
  role: UserRole;
  roles?: UserRole[];
}

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectRepository(BankAccount)
    private readonly bankAccountsRepository: Repository<BankAccount>,
    @InjectRepository(Owner)
    private readonly ownersRepository: Repository<Owner>,
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findAll(
    companyId: string,
    user: UserContext,
    ownerId?: string,
  ): Promise<BankAccount[]> {
    this.assertCompanyContext(companyId, user);
    const where: Record<string, unknown> = {
      companyId,
      deletedAt: IsNull(),
    };

    if (hasRole(user, UserRole.OWNER) && !isAdminOrStaff(user)) {
      const owner = await this.ownersRepository.findOne({
        where: { userId: user.id, companyId },
      });
      if (!owner) return [];
      where['ownerId'] = owner.id;
    } else if (ownerId) {
      where['ownerId'] = ownerId;
    }

    return this.bankAccountsRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  private async resolveOwnerForUser(
    user: UserContext,
    companyId: string,
  ): Promise<Owner | null> {
    return this.ownersRepository.findOne({
      where: { userId: user.id, companyId },
    });
  }

  async findOne(
    id: string,
    companyId: string,
    user?: UserContext,
  ): Promise<BankAccount> {
    if (user) this.assertCompanyContext(companyId, user);
    const account = await this.bankAccountsRepository.findOne({
      where: { id, companyId, deletedAt: IsNull() },
    });
    if (!account) {
      throw new NotFoundException(`BankAccount ${id} not found`);
    }
    if (user && hasRole(user, UserRole.OWNER) && !isAdminOrStaff(user)) {
      const owner = await this.resolveOwnerForUser(user, companyId);
      if (!owner || account.ownerId !== owner.id) {
        throw new ForbiddenException(
          'You can only access your own bank accounts',
        );
      }
    }
    return account;
  }

  async create(
    dto: CreateBankAccountDto,
    companyId: string,
    user?: UserContext,
  ): Promise<BankAccount> {
    if (user) this.assertCompanyContext(companyId, user);
    let ownerId = dto.ownerId ?? null;
    let userId = dto.userId ?? null;

    if (user && hasRole(user, UserRole.OWNER) && !isAdminOrStaff(user)) {
      const owner = await this.resolveOwnerForUser(user, companyId);
      if (!owner) {
        throw new ForbiddenException('Owner profile not found');
      }
      ownerId = owner.id;
      userId = user.id;
    }

    await this.validateReferences(
      companyId,
      user,
      ownerId,
      userId,
      dto.propertyId ?? null,
    );
    this.validateVirtualAlias(dto);

    if (dto.isDefault) {
      await this.bankAccountsRepository.update(
        { companyId, ownerId: ownerId ?? (IsNull() as any) },
        { isDefault: false },
      );
    }
    const account = this.bankAccountsRepository.create({
      ...dto,
      companyId,
      currency: dto.currency ?? 'ARS',
      ownerId,
      userId,
    });
    return this.bankAccountsRepository.save(account);
  }

  async update(
    id: string,
    dto: UpdateBankAccountDto,
    companyId: string,
    user?: UserContext,
  ): Promise<BankAccount> {
    if (user) this.assertCompanyContext(companyId, user);
    const account = await this.findOne(id, companyId, user);
    const isOwnerSelfService = Boolean(
      user && hasRole(user, UserRole.OWNER) && !isAdminOrStaff(user),
    );
    const nextOwnerId = isOwnerSelfService
      ? account.ownerId
      : (dto.ownerId ?? account.ownerId);
    const nextUserId = isOwnerSelfService
      ? user!.id
      : (dto.userId ?? account.userId);
    const nextPropertyId = dto.propertyId ?? account.propertyId;

    await this.validateReferences(
      companyId,
      user,
      nextOwnerId,
      nextUserId,
      nextPropertyId,
    );
    this.validateVirtualAlias({
      isVirtualAlias: dto.isVirtualAlias ?? account.isVirtualAlias,
      propertyId: nextPropertyId ?? undefined,
      alias: dto.alias ?? account.alias ?? undefined,
    });

    if (dto.isDefault) {
      await this.bankAccountsRepository.update(
        { companyId, ownerId: account.ownerId ?? (IsNull() as any) },
        { isDefault: false },
      );
    }

    Object.assign(account, dto, {
      ownerId: nextOwnerId,
      userId: nextUserId,
      propertyId: nextPropertyId,
    });
    return this.bankAccountsRepository.save(account);
  }

  private async validateReferences(
    companyId: string,
    user: UserContext | undefined,
    ownerId: string | null,
    userId: string | null,
    propertyId: string | null,
  ): Promise<void> {
    if (userId) {
      const referencedUser = await this.usersRepository.findOne({
        where: { id: userId, companyId },
      });
      if (!referencedUser) {
        throw new BadRequestException(
          'Bank account user must belong to company',
        );
      }
    }

    if (ownerId) {
      const owner = await this.ownersRepository.findOne({
        where: { id: ownerId, companyId },
      });
      if (!owner) {
        throw new BadRequestException(
          'Bank account owner must belong to company',
        );
      }
    }

    if (!propertyId) return;

    const property = await this.propertiesRepository.findOne({
      where: { id: propertyId, companyId },
    });
    if (!property) {
      throw new BadRequestException(
        'Virtual alias property must belong to company',
      );
    }
    if (
      user &&
      hasRole(user, UserRole.OWNER) &&
      !isAdminOrStaff(user) &&
      property.ownerId !== ownerId
    ) {
      throw new ForbiddenException(
        'You can only assign aliases to your own properties',
      );
    }
  }

  private validateVirtualAlias(
    values: Pick<
      CreateBankAccountDto,
      'isVirtualAlias' | 'propertyId' | 'alias'
    >,
  ): void {
    if (!values.isVirtualAlias) return;
    if (!values.propertyId || !values.alias?.trim()) {
      throw new BadRequestException(
        'Virtual bank accounts require propertyId and alias',
      );
    }
  }

  async remove(
    id: string,
    companyId: string,
    user: UserContext,
  ): Promise<void> {
    this.assertCompanyContext(companyId, user);
    if (!hasRole(user, UserRole.ADMIN)) {
      throw new ForbiddenException('Only admins can delete bank accounts');
    }
    const account = await this.findOne(id, companyId, user);
    await this.bankAccountsRepository.softDelete({
      id: account.id,
      companyId,
    });
  }

  private assertCompanyContext(companyId: string, user: UserContext): void {
    if (!companyId || !user.companyId || companyId !== user.companyId) {
      throw new ForbiddenException('Company scope mismatch');
    }
  }
}
