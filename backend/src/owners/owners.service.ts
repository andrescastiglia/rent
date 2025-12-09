import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Owner } from './entities/owner.entity';

@Injectable()
export class OwnersService {
  constructor(
    @InjectRepository(Owner)
    private readonly ownersRepository: Repository<Owner>,
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
}
