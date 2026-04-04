import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { Staff } from './entities/staff.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { StaffFiltersDto } from './dto/staff-filters.dto';

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(Staff)
    private readonly staffRepository: Repository<Staff>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findAll(companyId: string, filters: StaffFiltersDto): Promise<Staff[]> {
    const qb = this.staffRepository
      .createQueryBuilder('staff')
      .leftJoinAndSelect('staff.user', 'user')
      .where('staff.company_id = :companyId', { companyId })
      .andWhere('staff.deleted_at IS NULL');

    if (filters.specialization) {
      qb.andWhere('staff.specialization = :specialization', {
        specialization: filters.specialization,
      });
    }

    if (filters.search) {
      const search = `%${filters.search.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(user.first_name) LIKE :search OR LOWER(user.last_name) LIKE :search OR LOWER(user.email) LIKE :search)',
        { search },
      );
    }

    return qb.orderBy('staff.created_at', 'DESC').getMany();
  }

  async findOne(id: string, companyId: string): Promise<Staff> {
    const staff = await this.staffRepository.findOne({
      where: { id, companyId, deletedAt: IsNull() },
      relations: ['user'],
    });

    if (!staff) {
      throw new NotFoundException(`Staff member with ID ${id} not found`);
    }

    return staff;
  }

  async create(dto: CreateStaffDto, companyId: string): Promise<Staff> {
    const normalizedEmail = dto.email?.trim().toLowerCase() || null;

    if (normalizedEmail) {
      const existingUser = await this.usersRepository.findOne({
        where: { email: normalizedEmail, deletedAt: IsNull() },
      });

      if (existingUser) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    const passwordHash = await bcrypt.hash(
      randomBytes(16).toString('hex'),
      await bcrypt.genSalt(),
    );

    const user = this.usersRepository.create({
      companyId,
      role: UserRole.STAFF,
      email: normalizedEmail,
      passwordHash,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      phone: dto.phone?.trim() || undefined,
      isActive: true,
      permissions: {},
    });

    const savedUser = await this.usersRepository.save(user);

    const staff = this.staffRepository.create({
      userId: savedUser.id,
      companyId,
      specialization: dto.specialization,
      hourlyRate: dto.hourlyRate,
      currency: dto.currency ?? 'ARS',
      serviceAreas: dto.serviceAreas,
      certifications: dto.certifications,
      notes: dto.notes?.trim(),
    });

    const savedStaff = await this.staffRepository.save(staff);
    return this.findOne(savedStaff.id, companyId);
  }

  async update(
    id: string,
    dto: UpdateStaffDto,
    companyId: string,
  ): Promise<Staff> {
    const staff = await this.findOne(id, companyId);

    if (dto.email !== undefined) {
      const normalizedEmail = dto.email?.trim().toLowerCase() || null;
      const nextEmail =
        normalizedEmail && normalizedEmail.length > 0 ? normalizedEmail : null;

      if (nextEmail !== staff.user.email) {
        if (nextEmail) {
          const existingUser = await this.usersRepository.findOne({
            where: { email: nextEmail, deletedAt: IsNull() },
          });
          if (existingUser && existingUser.id !== staff.userId) {
            throw new ConflictException(
              'A user with this email already exists',
            );
          }
        }
        staff.user.email = nextEmail;
      }
    }

    if (dto.firstName !== undefined)
      staff.user.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) staff.user.lastName = dto.lastName.trim();
    if (dto.phone !== undefined) staff.user.phone = dto.phone?.trim() || null;

    await this.usersRepository.save(staff.user);

    if (dto.specialization !== undefined)
      staff.specialization = dto.specialization;
    if (dto.hourlyRate !== undefined) staff.hourlyRate = dto.hourlyRate;
    if (dto.currency !== undefined) staff.currency = dto.currency;
    if (dto.serviceAreas !== undefined) staff.serviceAreas = dto.serviceAreas;
    if (dto.certifications !== undefined)
      staff.certifications = dto.certifications;
    if (dto.notes !== undefined) staff.notes = dto.notes?.trim();

    await this.staffRepository.save(staff);
    return this.findOne(id, companyId);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const staff = await this.findOne(id, companyId);

    await this.usersRepository.update(staff.userId, { isActive: false });
    await this.staffRepository.softDelete(id);
  }

  async activate(id: string, companyId: string): Promise<Staff> {
    const staff = await this.staffRepository.findOne({
      where: { id, companyId },
      relations: ['user'],
      withDeleted: true,
    });

    if (!staff) {
      throw new NotFoundException(`Staff member with ID ${id} not found`);
    }

    await this.staffRepository.restore(id);
    await this.usersRepository.update(staff.userId, {
      isActive: true,
      deletedAt: null as unknown as Date,
    });

    return this.findOne(id, companyId);
  }
}
