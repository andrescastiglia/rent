import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CreatePaymentDocumentTemplateDto } from './dto/create-payment-document-template.dto';
import { UpdatePaymentDocumentTemplateDto } from './dto/update-payment-document-template.dto';
import {
  PaymentDocumentTemplate,
  PaymentDocumentTemplateType,
} from './entities/payment-document-template.entity';

@Injectable()
export class PaymentDocumentTemplatesService {
  constructor(
    @InjectRepository(PaymentDocumentTemplate)
    private readonly templatesRepository: Repository<PaymentDocumentTemplate>,
  ) {}

  async list(
    companyId: string,
    type?: PaymentDocumentTemplateType,
  ): Promise<PaymentDocumentTemplate[]> {
    const query = this.templatesRepository
      .createQueryBuilder('template')
      .where('template.company_id = :companyId', { companyId })
      .andWhere('template.deleted_at IS NULL')
      .orderBy('template.isDefault', 'DESC')
      .addOrderBy('template.updatedAt', 'DESC');

    if (type) {
      query.andWhere('template.type = :type', { type });
    }

    return query.getMany();
  }

  async create(
    dto: CreatePaymentDocumentTemplateDto,
    companyId: string,
  ): Promise<PaymentDocumentTemplate> {
    if (dto.isDefault && dto.isActive === false) {
      throw new BadRequestException('Default template must be active');
    }

    return this.templatesRepository.manager.transaction(
      async (entityManager) => {
        const repository = entityManager.getRepository(PaymentDocumentTemplate);
        let isDefault = dto.isDefault ?? false;

        if (!isDefault) {
          const existing = await repository.count({
            where: {
              companyId,
              type: dto.type,
              deletedAt: IsNull(),
            },
          });
          if (existing === 0) {
            isDefault = true;
          }
        }

        if (isDefault) {
          await repository
            .createQueryBuilder()
            .update(PaymentDocumentTemplate)
            .set({ isDefault: false })
            .where('company_id = :companyId', { companyId })
            .andWhere('type = :type', { type: dto.type })
            .andWhere('deleted_at IS NULL')
            .execute();
        }

        const template = repository.create({
          companyId,
          type: dto.type,
          name: dto.name.trim(),
          templateBody: dto.templateBody,
          isActive: dto.isActive ?? true,
          isDefault,
        });
        const saved = await repository.save(template);
        await this.ensureTypeHasDefault(repository, companyId, dto.type);
        return saved;
      },
    );
  }

  async update(
    id: string,
    dto: UpdatePaymentDocumentTemplateDto,
    companyId: string,
  ): Promise<PaymentDocumentTemplate> {
    if (dto.isDefault && dto.isActive === false) {
      throw new BadRequestException('Default template must be active');
    }

    return this.templatesRepository.manager.transaction(
      async (entityManager) => {
        const repository = entityManager.getRepository(PaymentDocumentTemplate);
        const template = await repository.findOne({
          where: { id, companyId, deletedAt: IsNull() },
        });
        if (!template) {
          throw new NotFoundException(`Template with ID ${id} not found`);
        }
        const previousType = template.type;

        if (dto.type !== undefined) template.type = dto.type;
        if (dto.name !== undefined) template.name = dto.name.trim();
        if (dto.templateBody !== undefined)
          template.templateBody = dto.templateBody;
        if (dto.isActive !== undefined) template.isActive = dto.isActive;
        if (dto.isDefault !== undefined) template.isDefault = dto.isDefault;

        if (template.isDefault) {
          await repository
            .createQueryBuilder()
            .update(PaymentDocumentTemplate)
            .set({ isDefault: false })
            .where('company_id = :companyId', { companyId })
            .andWhere('type = :type', { type: template.type })
            .andWhere('id <> :id', { id: template.id })
            .andWhere('deleted_at IS NULL')
            .execute();
        }
        const saved = await repository.save(template);
        await this.ensureTypeHasDefault(repository, companyId, saved.type);
        if (saved.type !== previousType) {
          await this.ensureTypeHasDefault(repository, companyId, previousType);
        }
        return saved;
      },
    );
  }

  async findActiveTemplate(
    companyId: string,
    type: PaymentDocumentTemplateType,
  ): Promise<PaymentDocumentTemplate | null> {
    return this.templatesRepository
      .createQueryBuilder('template')
      .where('template.company_id = :companyId', { companyId })
      .andWhere('template.type = :type', { type })
      .andWhere('template.is_active = TRUE')
      .andWhere('template.deleted_at IS NULL')
      .orderBy('template.isDefault', 'DESC')
      .addOrderBy('template.updatedAt', 'DESC')
      .getOne();
  }

  private async ensureTypeHasDefault(
    repository: Repository<PaymentDocumentTemplate>,
    companyId: string,
    type: PaymentDocumentTemplateType,
  ): Promise<void> {
    const hasDefault = await repository.findOne({
      where: { companyId, type, isDefault: true, deletedAt: IsNull() },
      select: { id: true },
    });
    if (hasDefault) {
      return;
    }

    const fallback = await repository.findOne({
      where: { companyId, type, isActive: true, deletedAt: IsNull() },
      order: { updatedAt: 'DESC' },
    });
    if (!fallback) {
      return;
    }

    fallback.isDefault = true;
    await repository.save(fallback);
  }
}
