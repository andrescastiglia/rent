import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

type CreateUserInput = CreateUserDto & {
  isActive?: boolean;
  accessRequested?: boolean;
  companyId?: string;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserInput): Promise<User> {
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

    const user = this.usersRepository.create({
      ...createUserDto,
      email: createUserDto.email.trim().toLowerCase(),
      passwordHash: hashedPassword,
      permissions: createUserDto.permissions ?? {},
      accessRequested: createUserDto.accessRequested ?? true,
      roles: Array.from(
        new Set([createUserDto.role, ...(createUserDto.roles ?? [])]),
      ),
    });
    return this.usersRepository.save(user);
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    companyId: string = '',
  ): Promise<{ data: User[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.usersRepository.findAndCount({
      where: { companyId },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOneByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.trim().toLowerCase() },
    });
  }

  async findOneByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('LOWER(user.email) = :email', {
        email: email.trim().toLowerCase(),
      })
      .getOne();
  }

  async findOneById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findOneByIdScoped(id: string, companyId: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id, companyId } });
  }

  async findOneByIdWithPassword(id: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId: id })
      .getOne();
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    companyId: string = '',
  ): Promise<User> {
    const user = await this.findOneByIdScoped(id, companyId);
    if (!user) {
      throw new NotFoundException('user.notFound');
    }

    await this.applyUserUpdates(user, updateUserDto, false);
    return this.usersRepository.save(user);
  }

  async updateProfile(
    id: string,
    updateUserDto: UpdateProfileDto,
  ): Promise<User> {
    if ('permissions' in updateUserDto) {
      throw new BadRequestException('Profile cannot change permissions');
    }
    const user = await this.findOneById(id);
    if (!user) throw new NotFoundException('user.notFound');
    await this.applyUserUpdates(user, updateUserDto, true);
    return this.usersRepository.save(user);
  }

  async remove(id: string, companyId: string = ''): Promise<void> {
    const user = await this.findOneByIdScoped(id, companyId);
    if (!user) {
      throw new NotFoundException('user.notFound');
    }

    await this.usersRepository.softDelete(id);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.findOneByIdWithPassword(userId);
    if (!user) {
      throw new NotFoundException('user.notFound');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('user.currentPasswordIncorrect');
    }

    // Hash new password
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    user.passwordHash = hashedPassword;
    await this.usersRepository.save(user);
  }

  async setActivation(
    userId: string,
    isActive: boolean,
    companyId: string = '',
  ): Promise<User> {
    const user = await this.findOneByIdScoped(userId, companyId);
    if (!user) {
      throw new NotFoundException('user.notFound');
    }

    user.isActive = isActive;
    if (isActive) user.accessRequested = true;
    return this.usersRepository.save(user);
  }

  async resetPassword(
    userId: string,
    newPassword?: string,
    companyId: string = '',
  ): Promise<{ user: User; temporaryPassword: string }> {
    const user = await this.findOneByIdScoped(userId, companyId);
    if (!user) {
      throw new NotFoundException('user.notFound');
    }

    const temporaryPassword =
      newPassword && newPassword.trim().length >= 8
        ? newPassword.trim()
        : this.generateTemporaryPassword();

    const salt = await bcrypt.genSalt();
    user.passwordHash = await bcrypt.hash(temporaryPassword, salt);
    user.accessRequested = true;
    await this.usersRepository.save(user);

    return { user, temporaryPassword };
  }

  private async applyUserUpdates(
    user: User,
    updateUserDto: UpdateUserDto,
    allowWhatsappConsent: boolean,
  ): Promise<void> {
    if (updateUserDto.email !== undefined) {
      const nextEmail = updateUserDto.email.trim().toLowerCase();
      const existing = await this.findOneByEmail(nextEmail);
      if (existing && existing.id !== user.id) {
        throw new ConflictException('Email already exists');
      }
      user.email = nextEmail;
    }

    if (updateUserDto.firstName !== undefined) {
      user.firstName = updateUserDto.firstName.trim();
    }

    if (updateUserDto.lastName !== undefined) {
      user.lastName = updateUserDto.lastName.trim();
    }

    if (updateUserDto.phone !== undefined) {
      user.phone = updateUserDto.phone.trim();
    }

    if (updateUserDto.whatsappEnabled !== undefined) {
      if (!allowWhatsappConsent) {
        throw new BadRequestException(
          'WhatsApp consent can only be changed by the account owner',
        );
      }
      if (updateUserDto.whatsappEnabled && !user.phone?.trim()) {
        throw new BadRequestException(
          'A phone number is required to enable WhatsApp',
        );
      }
      user.whatsappEnabled = updateUserDto.whatsappEnabled;
      user.whatsappEnabledAt = updateUserDto.whatsappEnabled
        ? new Date()
        : null;
    }

    if (updateUserDto.language !== undefined) {
      user.language = updateUserDto.language;
    }

    if (updateUserDto.roles !== undefined || updateUserDto.role !== undefined) {
      if (allowWhatsappConsent) {
        throw new BadRequestException('Profile cannot change roles');
      }
      const primaryRole = updateUserDto.role ?? user.role;
      user.role = primaryRole;
      user.roles = Array.from(
        new Set([primaryRole, ...(updateUserDto.roles ?? user.roles ?? [])]),
      );
    }

    if (updateUserDto.avatarUrl !== undefined) {
      const avatar = (updateUserDto.avatarUrl ?? '').trim();
      user.avatarUrl = avatar.length > 0 ? avatar : null;
    }

    if (updateUserDto.permissions !== undefined) {
      user.permissions = updateUserDto.permissions;
    }
  }

  private generateTemporaryPassword(): string {
    return randomBytes(8).toString('hex');
  }
}
