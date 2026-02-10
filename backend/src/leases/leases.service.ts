import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  ContractType,
  LateFeeType,
  Lease,
  LeaseStatus,
} from './entities/lease.entity';
import {
  Property,
  PropertyOperationState,
} from '../properties/entities/property.entity';
import { InterestedProfile } from '../interested/entities/interested-profile.entity';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { LeaseFiltersDto } from './dto/lease-filters.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';
import { PdfService } from './pdf.service';
import { LeaseContractTemplate } from './entities/lease-contract-template.entity';
import { CreateLeaseContractTemplateDto } from './dto/create-lease-contract-template.dto';
import { UpdateLeaseContractTemplateDto } from './dto/update-lease-contract-template.dto';

@Injectable()
export class LeasesService {
  constructor(
    @InjectRepository(Lease)
    private readonly leasesRepository: Repository<Lease>,
    @InjectRepository(LeaseContractTemplate)
    private readonly templatesRepository: Repository<LeaseContractTemplate>,
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
    @InjectRepository(InterestedProfile)
    private readonly interestedProfilesRepository: Repository<InterestedProfile>,
    private readonly pdfService: PdfService,
  ) {}

  async create(createLeaseDto: CreateLeaseDto): Promise<Lease> {
    const contractType = createLeaseDto.contractType ?? ContractType.RENTAL;
    const template = createLeaseDto.templateId
      ? await this.findTemplate(
          createLeaseDto.templateId,
          createLeaseDto.companyId,
          contractType,
        )
      : null;
    if (createLeaseDto.templateId && !template) {
      throw new NotFoundException(
        `Template with ID ${createLeaseDto.templateId} not found`,
      );
    }

    const property = await this.propertiesRepository.findOne({
      where: { id: createLeaseDto.propertyId, deletedAt: IsNull() },
    });
    if (!property) {
      throw new NotFoundException(
        `Property with ID ${createLeaseDto.propertyId} not found`,
      );
    }

    if (contractType === ContractType.RENTAL) {
      this.validateRentalCreate(createLeaseDto);
      const existingActiveLease = await this.leasesRepository.findOne({
        where: {
          propertyId: property.id,
          contractType: ContractType.RENTAL,
          status: LeaseStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });
      if (existingActiveLease) {
        throw new ConflictException('Property already has an active contract');
      }
    } else {
      await this.validateSaleCreate(createLeaseDto);
    }

    const lease = this.leasesRepository.create({
      ...createLeaseDto,
      contractType,
      propertyId: property.id,
      ownerId: createLeaseDto.ownerId || property.ownerId,
      status: LeaseStatus.DRAFT,
      templateId: template?.id ?? null,
      templateName: template?.name ?? null,
      previousLeaseId: null,
      versionNumber: 1,
      tenantId:
        contractType === ContractType.RENTAL
          ? (createLeaseDto.tenantId ?? null)
          : null,
      buyerProfileId:
        contractType === ContractType.SALE
          ? (createLeaseDto.buyerProfileId ?? null)
          : null,
      monthlyRent:
        contractType === ContractType.RENTAL
          ? Number(createLeaseDto.monthlyRent ?? 0)
          : null,
      startDate:
        contractType === ContractType.RENTAL
          ? createLeaseDto.startDate
            ? new Date(createLeaseDto.startDate)
            : null
          : null,
      endDate:
        contractType === ContractType.RENTAL
          ? createLeaseDto.endDate
            ? new Date(createLeaseDto.endDate)
            : null
          : null,
      fiscalValue:
        contractType === ContractType.SALE
          ? Number(createLeaseDto.fiscalValue ?? 0)
          : null,
      lateFeeType:
        contractType === ContractType.RENTAL
          ? createLeaseDto.lateFeeType || LateFeeType.NONE
          : LateFeeType.NONE,
      lateFeeValue:
        contractType === ContractType.RENTAL
          ? Number(createLeaseDto.lateFeeValue ?? 0)
          : 0,
      adjustmentValue:
        contractType === ContractType.RENTAL
          ? createLeaseDto.adjustmentValue
          : 0,
      draftContractText: null,
      confirmedContractText: null,
      confirmedAt: null,
      contractPdfUrl: null,
    });

    const saved = await this.leasesRepository.save(lease);

    if (template) {
      return this.renderDraft(saved.id, template.id);
    }

    return this.findOne(saved.id);
  }

  async findAll(
    filters: LeaseFiltersDto,
  ): Promise<{ data: Lease[]; total: number; page: number; limit: number }> {
    const {
      propertyId,
      tenantId,
      buyerProfileId,
      status,
      contractType,
      propertyAddress,
      includeFinalized = false,
      page = 1,
      limit = 10,
    } = filters;

    const query = this.leasesRepository
      .createQueryBuilder('lease')
      .leftJoinAndSelect('lease.property', 'property')
      .leftJoinAndSelect('lease.tenant', 'tenant')
      .leftJoinAndSelect('lease.buyerProfile', 'buyerProfile')
      .where('lease.deleted_at IS NULL');

    if (propertyId) {
      query.andWhere('lease.property_id = :propertyId', { propertyId });
    }

    if (tenantId) {
      query.andWhere('lease.tenant_id = :tenantId', { tenantId });
    }

    if (buyerProfileId) {
      query.andWhere('lease.buyer_profile_id = :buyerProfileId', {
        buyerProfileId,
      });
    }

    if (status) {
      query.andWhere('lease.status = :status', { status });
    } else if (!includeFinalized) {
      query.andWhere('lease.status = :activeStatus', {
        activeStatus: LeaseStatus.ACTIVE,
      });
    } else {
      query.andWhere('lease.status IN (:...statuses)', {
        statuses: [LeaseStatus.ACTIVE, LeaseStatus.FINALIZED],
      });
    }

    if (contractType) {
      query.andWhere('lease.contract_type = :contractType', { contractType });
    }

    if (propertyAddress) {
      query.andWhere(
        `(
          property.address_street ILIKE :address OR
          property.address_city ILIKE :address OR
          property.address_state ILIKE :address OR
          property.address_postal_code ILIKE :address
        )`,
        {
          address: `%${propertyAddress}%`,
        },
      );
    }

    query
      .orderBy('lease.created_at', 'DESC')
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

  async findOne(id: string): Promise<Lease> {
    const lease = await this.leasesRepository.findOne({
      where: { id },
      relations: [
        'property',
        'property.owner',
        'property.owner.user',
        'tenant',
        'tenant.user',
        'buyerProfile',
        'template',
        'previousLease',
        'amendments',
      ],
    });

    if (!lease) {
      throw new NotFoundException(`Lease with ID ${id} not found`);
    }

    return lease;
  }

  async update(id: string, updateLeaseDto: UpdateLeaseDto): Promise<Lease> {
    const lease = await this.findOne(id);

    if (lease.status !== LeaseStatus.DRAFT) {
      return this.createRevision(lease, updateLeaseDto);
    }

    const effectiveType = updateLeaseDto.contractType ?? lease.contractType;
    await this.applyUpdateToLease(lease, updateLeaseDto, effectiveType);
    const saved = await this.leasesRepository.save(lease);

    if (saved.templateId) {
      return this.renderDraft(saved.id, saved.templateId);
    }

    return this.findOne(saved.id);
  }

  async renderDraft(leaseId: string, templateId?: string): Promise<Lease> {
    const lease = await this.findOne(leaseId);
    if (lease.status !== LeaseStatus.DRAFT) {
      throw new BadRequestException(
        'Only draft contracts can render templates',
      );
    }

    const template = await this.findTemplate(
      templateId ?? lease.templateId ?? undefined,
      lease.companyId,
      lease.contractType,
    );
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    const rendered = this.renderTemplateBody(template.templateBody, lease);
    lease.templateId = template.id;
    lease.templateName = template.name;
    lease.draftContractText = rendered;
    await this.leasesRepository.save(lease);
    return this.findOne(lease.id);
  }

  async updateDraftText(id: string, draftText: string): Promise<Lease> {
    const lease = await this.findOne(id);
    if (lease.status !== LeaseStatus.DRAFT) {
      throw new BadRequestException('Only draft contracts can be edited');
    }

    lease.draftContractText = draftText;
    await this.leasesRepository.save(lease);
    return this.findOne(id);
  }

  async confirmDraft(
    id: string,
    userId: string,
    finalText?: string,
  ): Promise<Lease> {
    const lease = await this.findOne(id);
    if (lease.status !== LeaseStatus.DRAFT) {
      throw new BadRequestException('Only draft contracts can be confirmed');
    }

    const textToConfirm = (finalText ?? lease.draftContractText ?? '').trim();
    if (!textToConfirm) {
      throw new BadRequestException('Contract draft text is required');
    }

    const resolvedText = this.replaceTemplateVariables(
      textToConfirm,
      this.buildTemplateContext(lease),
      false,
    ).trim();
    if (!resolvedText) {
      throw new BadRequestException('Contract draft text is required');
    }

    if (lease.contractType === ContractType.RENTAL && lease.propertyId) {
      const activeLease = await this.leasesRepository.findOne({
        where: {
          propertyId: lease.propertyId,
          contractType: ContractType.RENTAL,
          status: LeaseStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });
      if (activeLease && activeLease.id !== lease.id) {
        activeLease.status = LeaseStatus.FINALIZED;
        await this.leasesRepository.save(activeLease);
      }
    }

    lease.status = LeaseStatus.ACTIVE;
    lease.confirmedAt = new Date();
    lease.confirmedContractText = resolvedText;
    lease.draftContractText = resolvedText;

    if (lease.contractType === ContractType.RENTAL && lease.propertyId) {
      await this.propertiesRepository.update(lease.propertyId, {
        operationState: PropertyOperationState.RENTED,
      });
    }

    if (lease.contractType === ContractType.SALE && lease.propertyId) {
      await this.propertiesRepository.update(lease.propertyId, {
        operationState: PropertyOperationState.SOLD,
      });
    }

    const savedLease = await this.leasesRepository.save(lease);

    try {
      const document = await this.pdfService.generateContract(
        savedLease,
        userId,
        resolvedText,
      );
      savedLease.contractPdfUrl = document.fileUrl;
      await this.leasesRepository.save(savedLease);
    } catch (error) {
      console.error('Failed to generate contract PDF:', error);
    }

    return this.findOne(savedLease.id);
  }

  async activate(id: string, userId: string): Promise<Lease> {
    return this.confirmDraft(id, userId);
  }

  async terminate(id: string, reason?: string): Promise<Lease> {
    const lease = await this.findOne(id);

    if (lease.status !== LeaseStatus.ACTIVE) {
      throw new BadRequestException('Only active contracts can be finalized');
    }

    lease.status = LeaseStatus.FINALIZED;
    if (reason) {
      lease.notes = (lease.notes || '') + `\nFinalization reason: ${reason}`;
    }

    if (lease.contractType === ContractType.RENTAL && lease.propertyId) {
      await this.propertiesRepository.update(lease.propertyId, {
        operationState: PropertyOperationState.AVAILABLE,
      });
    }

    return this.leasesRepository.save(lease);
  }

  async renew(id: string, newTerms: Partial<CreateLeaseDto>): Promise<Lease> {
    const oldLease = await this.findOne(id);

    if (oldLease.status !== LeaseStatus.ACTIVE) {
      throw new BadRequestException('Only active contracts can be renewed');
    }

    oldLease.status = LeaseStatus.FINALIZED;
    await this.leasesRepository.save(oldLease);

    const payload: CreateLeaseDto = {
      companyId: oldLease.companyId,
      propertyId: oldLease.propertyId as string,
      tenantId: oldLease.tenantId ?? undefined,
      buyerProfileId: oldLease.buyerProfileId ?? undefined,
      ownerId: oldLease.ownerId,
      contractType: oldLease.contractType,
      startDate:
        newTerms.startDate ||
        (oldLease.endDate ? oldLease.endDate.toISOString().slice(0, 10) : ''),
      endDate: newTerms.endDate,
      monthlyRent: newTerms.monthlyRent ?? Number(oldLease.monthlyRent ?? 0),
      fiscalValue: newTerms.fiscalValue ?? Number(oldLease.fiscalValue ?? 0),
      currency: newTerms.currency || oldLease.currency,
      paymentFrequency: newTerms.paymentFrequency || oldLease.paymentFrequency,
      paymentDueDay: newTerms.paymentDueDay || oldLease.paymentDueDay,
      billingFrequency: newTerms.billingFrequency || oldLease.billingFrequency,
      billingDay: newTerms.billingDay || oldLease.billingDay,
      lateFeeType: newTerms.lateFeeType || oldLease.lateFeeType,
      lateFeeValue: newTerms.lateFeeValue ?? oldLease.lateFeeValue,
      lateFeeGraceDays: newTerms.lateFeeGraceDays ?? oldLease.lateFeeGraceDays,
      lateFeeMax: newTerms.lateFeeMax ?? oldLease.lateFeeMax,
      autoGenerateInvoices:
        newTerms.autoGenerateInvoices ?? oldLease.autoGenerateInvoices,
      adjustmentType: newTerms.adjustmentType || oldLease.adjustmentType,
      adjustmentValue: newTerms.adjustmentValue ?? oldLease.adjustmentValue,
      adjustmentFrequencyMonths:
        newTerms.adjustmentFrequencyMonths ??
        oldLease.adjustmentFrequencyMonths,
      inflationIndexType:
        newTerms.inflationIndexType || oldLease.inflationIndexType,
      increaseClauseType:
        newTerms.increaseClauseType || oldLease.increaseClauseType,
      increaseClauseValue:
        newTerms.increaseClauseValue ?? oldLease.increaseClauseValue,
      termsAndConditions:
        newTerms.termsAndConditions || oldLease.termsAndConditions,
      specialClauses: newTerms.specialClauses || oldLease.specialClauses,
      notes: newTerms.notes || oldLease.notes,
    };

    return this.create(payload);
  }

  async listTemplates(
    companyId: string,
    contractType?: ContractType,
  ): Promise<LeaseContractTemplate[]> {
    const query = this.templatesRepository
      .createQueryBuilder('template')
      .where('template.company_id = :companyId', { companyId })
      .andWhere('template.deleted_at IS NULL')
      .orderBy('template.updated_at', 'DESC');

    if (contractType) {
      query.andWhere('template.contract_type = :contractType', {
        contractType,
      });
    }

    return query.getMany();
  }

  async createTemplate(
    dto: CreateLeaseContractTemplateDto,
    companyId: string,
  ): Promise<LeaseContractTemplate> {
    const template = this.templatesRepository.create({
      companyId,
      name: dto.name.trim(),
      contractType: dto.contractType,
      templateBody: dto.templateBody,
      isActive: dto.isActive ?? true,
    });
    return this.templatesRepository.save(template);
  }

  async updateTemplate(
    id: string,
    dto: UpdateLeaseContractTemplateDto,
    companyId: string,
  ): Promise<LeaseContractTemplate> {
    const template = await this.templatesRepository.findOne({
      where: { id, companyId, deletedAt: IsNull() },
    });
    if (!template) {
      throw new NotFoundException(`Template with ID ${id} not found`);
    }

    if (dto.name !== undefined) template.name = dto.name.trim();
    if (dto.contractType !== undefined)
      template.contractType = dto.contractType;
    if (dto.templateBody !== undefined)
      template.templateBody = dto.templateBody;
    if (dto.isActive !== undefined) template.isActive = dto.isActive;

    return this.templatesRepository.save(template);
  }

  async remove(id: string): Promise<void> {
    const lease = await this.findOne(id);

    if (lease.status === LeaseStatus.ACTIVE) {
      throw new BadRequestException(
        'Cannot delete an active contract. Finalize it first.',
      );
    }

    await this.leasesRepository.softDelete(id);
  }

  private async createRevision(
    original: Lease,
    dto: UpdateLeaseDto,
  ): Promise<Lease> {
    const effectiveType = dto.contractType ?? original.contractType;
    const revision = this.leasesRepository.create({
      companyId: original.companyId,
      propertyId: original.propertyId,
      tenantId: original.tenantId,
      buyerProfileId: original.buyerProfileId,
      ownerId: original.ownerId,
      leaseNumber: original.leaseNumber,
      contractType: original.contractType,
      startDate: original.startDate,
      endDate: original.endDate,
      monthlyRent: original.monthlyRent,
      currency: original.currency,
      paymentFrequency: original.paymentFrequency,
      paymentDueDay: original.paymentDueDay,
      billingFrequency: original.billingFrequency,
      billingDay: original.billingDay,
      nextBillingDate: original.nextBillingDate,
      lastBillingDate: original.lastBillingDate,
      lateFeeType: original.lateFeeType,
      lateFeeValue: original.lateFeeValue,
      lateFeeGraceDays: original.lateFeeGraceDays,
      lateFeeMax: original.lateFeeMax,
      autoGenerateInvoices: original.autoGenerateInvoices,
      adjustmentType: original.adjustmentType,
      adjustmentValue: original.adjustmentValue,
      adjustmentFrequencyMonths: original.adjustmentFrequencyMonths,
      lastAdjustmentDate: original.lastAdjustmentDate,
      nextAdjustmentDate: original.nextAdjustmentDate,
      increaseClauseType: original.increaseClauseType,
      increaseClauseValue: original.increaseClauseValue,
      increaseClauseSchedule: original.increaseClauseSchedule,
      inflationIndexType: original.inflationIndexType,
      securityDeposit: original.securityDeposit,
      fiscalValue: original.fiscalValue,
      depositCurrency: original.depositCurrency,
      expensesIncluded: original.expensesIncluded,
      additionalExpenses: original.additionalExpenses,
      termsAndConditions: original.termsAndConditions,
      specialClauses: original.specialClauses,
      templateId: original.templateId,
      templateName: original.templateName,
      draftContractText:
        original.confirmedContractText ?? original.draftContractText ?? null,
      notes: original.notes,
      status: LeaseStatus.DRAFT,
      previousLeaseId: original.id,
      versionNumber: Number(original.versionNumber ?? 1) + 1,
      confirmedAt: null,
      confirmedContractText: null,
      contractPdfUrl: null,
    });

    await this.applyUpdateToLease(revision, dto, effectiveType);
    const saved = await this.leasesRepository.save(revision);

    if (saved.templateId) {
      return this.renderDraft(saved.id, saved.templateId);
    }

    if (!saved.draftContractText && original.confirmedContractText) {
      saved.draftContractText = original.confirmedContractText;
      await this.leasesRepository.save(saved);
    }

    return this.findOne(saved.id);
  }

  private async applyUpdateToLease(
    lease: Lease,
    dto: UpdateLeaseDto,
    effectiveType: ContractType,
  ): Promise<void> {
    if (effectiveType === ContractType.RENTAL) {
      this.validateRentalDates(
        dto.startDate ?? lease.startDate?.toISOString(),
        dto.endDate ?? lease.endDate?.toISOString(),
      );
    } else if (effectiveType === ContractType.SALE) {
      if (!dto.buyerProfileId && !lease.buyerProfileId) {
        throw new BadRequestException('Sale contracts require buyerProfileId');
      }
      if (
        dto.fiscalValue === undefined &&
        (lease.fiscalValue === undefined || lease.fiscalValue === null)
      ) {
        throw new BadRequestException('Sale contracts require fiscalValue');
      }
    }

    if (dto.propertyId) {
      const property = await this.propertiesRepository.findOne({
        where: { id: dto.propertyId, deletedAt: IsNull() },
      });
      if (!property) {
        throw new NotFoundException('Property not found');
      }
      lease.propertyId = property.id;
      if (!dto.ownerId) {
        lease.ownerId = property.ownerId;
      }
    }

    if (dto.templateId !== undefined) {
      if (!dto.templateId) {
        lease.templateId = null;
        lease.templateName = null;
      } else {
        const template = await this.findTemplate(
          dto.templateId,
          lease.companyId,
          effectiveType,
        );
        if (!template) {
          throw new NotFoundException(
            `Template with ID ${dto.templateId} not found`,
          );
        }
        lease.templateId = template.id;
        lease.templateName = template.name;
      }
    }

    Object.assign(lease, {
      ...dto,
      contractType: effectiveType,
      startDate:
        dto.startDate !== undefined
          ? dto.startDate
            ? new Date(dto.startDate)
            : null
          : lease.startDate,
      endDate:
        dto.endDate !== undefined
          ? dto.endDate
            ? new Date(dto.endDate)
            : null
          : lease.endDate,
    });

    if (effectiveType === ContractType.SALE) {
      lease.tenantId = null;
      lease.monthlyRent = null;
      lease.startDate = null;
      lease.endDate = null;
      lease.lateFeeType = LateFeeType.NONE;
      lease.lateFeeValue = 0;
      lease.adjustmentValue = 0;
    }
  }

  private async findTemplate(
    templateId: string | undefined,
    companyId: string,
    contractType?: ContractType,
  ): Promise<LeaseContractTemplate | null> {
    if (!templateId) {
      return null;
    }

    const template = await this.templatesRepository.findOne({
      where: { id: templateId, companyId, deletedAt: IsNull() },
    });
    if (!template) {
      return null;
    }

    if (contractType && template.contractType !== contractType) {
      throw new BadRequestException(
        'Template contract type does not match lease contract type',
      );
    }

    return template;
  }

  private renderTemplateBody(templateBody: string, lease: Lease): string {
    return this.replaceTemplateVariables(
      templateBody,
      this.buildTemplateContext(lease),
      true,
    );
  }

  private buildTemplateContext(lease: Lease): Record<string, unknown> {
    const hasLateFee =
      lease.lateFeeType &&
      lease.lateFeeType !== LateFeeType.NONE &&
      Number(lease.lateFeeValue ?? 0) > 0;
    const hasAdjustment =
      lease.adjustmentType &&
      (lease.adjustmentType !== 'fixed' ||
        Number(lease.adjustmentValue ?? 0) > 0);

    const context: Record<string, unknown> = {
      today: new Date().toISOString().slice(0, 10),
      lease: {
        id: lease.id,
        leaseNumber: lease.leaseNumber,
        contractType: lease.contractType,
        startDate: lease.startDate?.toISOString().slice(0, 10),
        endDate: lease.endDate?.toISOString().slice(0, 10),
        monthlyRent: lease.monthlyRent,
        fiscalValue: lease.fiscalValue,
        currency: lease.currency,
        paymentFrequency: lease.paymentFrequency,
        paymentDueDay: lease.paymentDueDay,
        billingFrequency: lease.billingFrequency,
        billingDay: lease.billingDay,
        lateFeeType: hasLateFee ? lease.lateFeeType : null,
        lateFeeValue: hasLateFee ? lease.lateFeeValue : null,
        lateFeeGraceDays: hasLateFee ? lease.lateFeeGraceDays : null,
        lateFeeMax: hasLateFee ? lease.lateFeeMax : null,
        adjustmentType: hasAdjustment ? lease.adjustmentType : null,
        adjustmentValue: hasAdjustment ? lease.adjustmentValue : null,
        adjustmentFrequencyMonths: hasAdjustment
          ? lease.adjustmentFrequencyMonths
          : null,
        inflationIndexType: lease.inflationIndexType,
        securityDeposit: lease.securityDeposit,
        termsAndConditions: lease.termsAndConditions,
        notes: lease.notes,
      },
      property: {
        name: lease.property?.name,
        addressStreet: lease.property?.addressStreet,
        addressNumber: lease.property?.addressNumber,
        addressCity: lease.property?.addressCity,
        addressState: lease.property?.addressState,
        addressPostalCode: lease.property?.addressPostalCode,
        addressCountry: lease.property?.addressCountry,
      },
      owner: {
        firstName: lease.property?.owner?.user?.firstName,
        lastName: lease.property?.owner?.user?.lastName,
        fullName:
          `${lease.property?.owner?.user?.firstName ?? ''} ${lease.property?.owner?.user?.lastName ?? ''}`.trim() ||
          null,
        email: lease.property?.owner?.user?.email,
        phone: lease.property?.owner?.user?.phone,
      },
      tenant: {
        firstName: lease.tenant?.user?.firstName,
        lastName: lease.tenant?.user?.lastName,
        fullName:
          `${lease.tenant?.user?.firstName ?? ''} ${lease.tenant?.user?.lastName ?? ''}`.trim() ||
          null,
        email: lease.tenant?.user?.email,
        phone: lease.tenant?.user?.phone,
      },
      buyer: {
        firstName: lease.buyerProfile?.firstName,
        lastName: lease.buyerProfile?.lastName,
        fullName:
          `${lease.buyerProfile?.firstName ?? ''} ${lease.buyerProfile?.lastName ?? ''}`.trim() ||
          null,
        email: lease.buyerProfile?.email,
        phone: lease.buyerProfile?.phone,
      },
    };

    return context;
  }

  private replaceTemplateVariables(
    templateBody: string,
    context: Record<string, unknown>,
    dropParagraphsWithMissingValues: boolean,
  ): string {
    const paragraphs = templateBody.split(/\n\s*\n/);
    const renderedParagraphs: string[] = [];

    for (const paragraph of paragraphs) {
      let hasMissingValue = false;
      const rendered = paragraph.replace(
        /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g,
        (_full, key: string) => {
          const value = this.resolveTemplateValue(context, key);
          if (value === null || value === undefined || value === '') {
            hasMissingValue = true;
            return '';
          }
          return String(value);
        },
      );

      if (
        (!dropParagraphsWithMissingValues || !hasMissingValue) &&
        rendered.trim().length > 0
      ) {
        renderedParagraphs.push(rendered.trim());
      }
    }

    return renderedParagraphs.join('\n\n');
  }

  private resolveTemplateValue(
    context: Record<string, unknown>,
    path: string,
  ): unknown {
    const segments = path.split('.');
    let current: unknown = context;

    for (const segment of segments) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private validateRentalDates(startDate?: string, endDate?: string): void {
    if (!startDate || !endDate) {
      throw new BadRequestException(
        'Rental contracts require startDate and endDate',
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid contract dates');
    }
    if (end <= start) {
      throw new BadRequestException('End date must be after start date');
    }
  }

  private validateRentalCreate(dto: CreateLeaseDto): void {
    if (!dto.tenantId) {
      throw new BadRequestException('Rental contracts require tenantId');
    }
    if (dto.monthlyRent === undefined || dto.monthlyRent === null) {
      throw new BadRequestException('Rental contracts require monthlyRent');
    }
    this.validateRentalDates(dto.startDate, dto.endDate);
  }

  private async validateSaleCreate(dto: CreateLeaseDto): Promise<void> {
    if (!dto.buyerProfileId) {
      throw new BadRequestException('Sale contracts require buyerProfileId');
    }
    if (dto.fiscalValue === undefined || dto.fiscalValue === null) {
      throw new BadRequestException('Sale contracts require fiscalValue');
    }

    const buyer = await this.interestedProfilesRepository.findOne({
      where: { id: dto.buyerProfileId, deletedAt: IsNull() },
    });
    if (!buyer) {
      throw new NotFoundException('Buyer profile not found');
    }
  }
}
