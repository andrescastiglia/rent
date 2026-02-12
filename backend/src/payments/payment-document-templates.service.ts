import { Injectable, NotFoundException } from '@nestjs/common';
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
      .orderBy('template.updatedAt', 'DESC');

    if (type) {
      query.andWhere('template.type = :type', { type });
    }

    return query.getMany();
  }

  async create(
    dto: CreatePaymentDocumentTemplateDto,
    companyId: string,
  ): Promise<PaymentDocumentTemplate> {
    const template = this.templatesRepository.create({
      companyId,
      type: dto.type,
      name: dto.name.trim(),
      templateBody: dto.templateBody,
      isActive: dto.isActive ?? true,
    });

    return this.templatesRepository.save(template);
  }

  async update(
    id: string,
    dto: UpdatePaymentDocumentTemplateDto,
    companyId: string,
  ): Promise<PaymentDocumentTemplate> {
    const template = await this.templatesRepository.findOne({
      where: { id, companyId, deletedAt: IsNull() },
    });
    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    if (dto.type !== undefined) template.type = dto.type;
    if (dto.name !== undefined) template.name = dto.name.trim();
    if (dto.templateBody !== undefined)
      template.templateBody = dto.templateBody;
    if (dto.isActive !== undefined) template.isActive = dto.isActive;

    return this.templatesRepository.save(template);
  }

  async findActiveTemplate(
    companyId: string,
    type: PaymentDocumentTemplateType,
  ): Promise<PaymentDocumentTemplate | null> {
    return this.templatesRepository.findOne({
      where: {
        companyId,
        type,
        isActive: true,
        deletedAt: IsNull(),
      },
      order: { updatedAt: 'DESC' },
    });
  }
}
