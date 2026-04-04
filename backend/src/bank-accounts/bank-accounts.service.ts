import {
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

interface UserContext {
  id: string;
  companyId: string;
  role: UserRole;
}

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectRepository(BankAccount)
    private readonly bankAccountsRepository: Repository<BankAccount>,
    @InjectRepository(Owner)
    private readonly ownersRepository: Repository<Owner>,
  ) {}

  async findAll(
    companyId: string,
    user: UserContext,
    ownerId?: string,
  ): Promise<BankAccount[]> {
    const where: Record<string, unknown> = {
      companyId,
      deletedAt: IsNull(),
    };

    if (user.role === UserRole.OWNER) {
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
    const account = await this.bankAccountsRepository.findOne({
      where: { id, companyId, deletedAt: IsNull() },
    });
    if (!account) {
      throw new NotFoundException(`BankAccount ${id} not found`);
    }
    if (user?.role === UserRole.OWNER) {
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
    let ownerId = dto.ownerId ?? null;

    if (user?.role === UserRole.OWNER) {
      const owner = await this.resolveOwnerForUser(user, companyId);
      if (!owner) {
        throw new ForbiddenException('Owner profile not found');
      }
      ownerId = owner.id;
    }

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
    });
    return this.bankAccountsRepository.save(account);
  }

  async update(
    id: string,
    dto: UpdateBankAccountDto,
    companyId: string,
    user?: UserContext,
  ): Promise<BankAccount> {
    const account = await this.findOne(id, companyId, user);

    if (dto.isDefault) {
      await this.bankAccountsRepository.update(
        { companyId, ownerId: account.ownerId ?? (IsNull() as any) },
        { isDefault: false },
      );
    }

    Object.assign(account, dto);
    return this.bankAccountsRepository.save(account);
  }

  async remove(
    id: string,
    companyId: string,
    user: UserContext,
  ): Promise<void> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can delete bank accounts');
    }
    const account = await this.findOne(id, companyId);
    await this.bankAccountsRepository.softDelete(account.id);
  }
}
