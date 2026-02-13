import {
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

type CreateUserInput = CreateUserDto & {
  isActive?: boolean;
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
    });
    return this.usersRepository.save(user);
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ data: User[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.usersRepository.findAndCount({
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
    return this.usersRepository.findOne({ where: { email } });
  }

  async findOneById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOneById(id);
    if (!user) {
      throw new NotFoundException('user.notFound');
    }

    await this.applyUserUpdates(user, updateUserDto);
    return this.usersRepository.save(user);
  }

  async updateProfile(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOneById(id);
    if (!user) {
      throw new NotFoundException('user.notFound');
    }

    await this.applyUserUpdates(user, updateUserDto);
    return this.usersRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOneById(id);
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
    const user = await this.findOneById(userId);
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

  async setActivation(userId: string, isActive: boolean): Promise<User> {
    const user = await this.findOneById(userId);
    if (!user) {
      throw new NotFoundException('user.notFound');
    }

    user.isActive = isActive;
    return this.usersRepository.save(user);
  }

  async resetPassword(
    userId: string,
    newPassword?: string,
  ): Promise<{ user: User; temporaryPassword: string }> {
    const user = await this.findOneById(userId);
    if (!user) {
      throw new NotFoundException('user.notFound');
    }

    const temporaryPassword =
      newPassword && newPassword.trim().length >= 8
        ? newPassword.trim()
        : this.generateTemporaryPassword();

    const salt = await bcrypt.genSalt();
    user.passwordHash = await bcrypt.hash(temporaryPassword, salt);
    await this.usersRepository.save(user);

    return { user, temporaryPassword };
  }

  private async applyUserUpdates(
    user: User,
    updateUserDto: UpdateUserDto,
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

    if (updateUserDto.language !== undefined) {
      user.language = updateUserDto.language;
    }

    if (updateUserDto.avatarUrl !== undefined) {
      const avatar = (updateUserDto.avatarUrl ?? '').trim();
      user.avatarUrl = avatar.length > 0 ? avatar : null;
    }
  }

  private generateTemporaryPassword(): string {
    return randomBytes(8).toString('hex');
  }
}
