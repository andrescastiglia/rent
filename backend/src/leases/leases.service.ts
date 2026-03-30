import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import * as mammoth from 'mammoth';
import { parse as parseHtml } from 'node-html-parser';
import {
  BillingFrequency,
  ContractType,
  LateFeeType,
  Lease,
  LeaseRenewalAlertPeriodicity,
  LeaseStatus,
  PaymentFrequency,
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
import {
  LEASE_TEMPLATE_SOURCE_FILE_NAME_MAX_LENGTH,
  LEASE_TEMPLATE_SOURCE_MIME_TYPE_MAX_LENGTH,
  LeaseContractTemplate,
} from './entities/lease-contract-template.entity';
import { CreateLeaseContractTemplateDto } from './dto/create-lease-contract-template.dto';
import { UpdateLeaseContractTemplateDto } from './dto/update-lease-contract-template.dto';
import { TenantAccountsService } from '../payments/tenant-accounts.service';
import { UserRole } from '../users/entities/user.entity';
import {
  Document,
  DocumentStatus,
  DocumentType,
} from '../documents/entities/document.entity';
import { ImportLeaseTemplateDocxDto } from './dto/import-lease-template-docx.dto';
import { ImportCurrentLeaseDto } from './dto/import-current-lease.dto';
import { Buyer } from '../buyers/entities/buyer.entity';

type RequestUser = {
  id: string;
  role: UserRole;
  email?: string | null;
  phone?: string | null;
};

type UploadedLeaseFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

type LeaseContentFormat = 'plain_text' | 'html';

const execFile = promisify(execFileCallback);

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
    @InjectRepository(Buyer)
    private readonly buyersRepository: Repository<Buyer>,
    @InjectRepository(Document)
    private readonly documentsRepository: Repository<Document>,
    private readonly pdfService: PdfService,
    private readonly tenantAccountsService: TenantAccountsService,
  ) {}

  async create(createLeaseDto: CreateLeaseDto): Promise<Lease> {
    const { contractType, template, property } =
      await this.prepareCreateLeaseContext(createLeaseDto);

    const lease = this.leasesRepository.create(
      this.buildCreateLeaseData(
        createLeaseDto,
        contractType,
        property,
        template,
      ),
    );
    const saved = await this.leasesRepository.save(lease);
    return this.fetchCreatedLease(saved.id, template?.id);
  }

  private async prepareCreateLeaseContext(
    createLeaseDto: CreateLeaseDto,
  ): Promise<{
    contractType: ContractType;
    template: LeaseContractTemplate | null;
    property: Property;
  }> {
    const contractType = createLeaseDto.contractType ?? ContractType.RENTAL;
    const template = await this.resolveTemplateForLease(
      createLeaseDto.companyId,
      contractType,
      createLeaseDto.templateId,
    );
    this.ensureRequestedTemplateExists(createLeaseDto.templateId, template);

    const property = await this.findPropertyOrThrow(createLeaseDto.propertyId);
    await this.validateCreateForContractType(
      contractType,
      createLeaseDto,
      property.id,
    );

    return { contractType, template, property };
  }

  private fetchCreatedLease(
    leaseId: string,
    templateId?: string | null,
  ): Promise<Lease> {
    if (templateId) {
      return this.renderDraft(leaseId, templateId);
    }

    return this.findOne(leaseId);
  }

  private ensureRequestedTemplateExists(
    requestedTemplateId: string | undefined,
    template: LeaseContractTemplate | null,
  ): void {
    if (!requestedTemplateId || template) {
      return;
    }

    throw new NotFoundException(
      `Template with ID ${requestedTemplateId} not found`,
    );
  }

  private async findPropertyOrThrow(propertyId: string): Promise<Property> {
    const property = await this.propertiesRepository.findOne({
      where: { id: propertyId, deletedAt: IsNull() },
    });

    if (property) {
      return property;
    }

    throw new NotFoundException(`Property with ID ${propertyId} not found`);
  }

  private buildCreateLeaseData(
    createLeaseDto: CreateLeaseDto,
    contractType: ContractType,
    property: Property,
    template: LeaseContractTemplate | null,
  ): Partial<Lease> {
    const isRental = contractType === ContractType.RENTAL;
    const startDate =
      isRental && createLeaseDto.startDate
        ? new Date(createLeaseDto.startDate)
        : null;
    const endDate =
      isRental && createLeaseDto.endDate
        ? new Date(createLeaseDto.endDate)
        : null;
    const nextAdjustmentDate = createLeaseDto.nextAdjustmentDate
      ? new Date(createLeaseDto.nextAdjustmentDate)
      : undefined;

    return {
      ...createLeaseDto,
      contractType,
      propertyId: property.id,
      ownerId: createLeaseDto.ownerId || property.ownerId,
      status: LeaseStatus.DRAFT,
      templateId: template?.id ?? null,
      templateName: template?.name ?? null,
      previousLeaseId: null,
      versionNumber: 1,
      tenantId: isRental ? (createLeaseDto.tenantId ?? null) : null,
      buyerId: isRental ? null : (createLeaseDto.buyerId ?? null),
      monthlyRent: isRental ? Number(createLeaseDto.monthlyRent ?? 0) : null,
      startDate,
      endDate,
      renewalAlertEnabled: createLeaseDto.renewalAlertEnabled ?? true,
      renewalAlertPeriodicity: createLeaseDto.renewalAlertPeriodicity,
      renewalAlertCustomDays: createLeaseDto.renewalAlertCustomDays ?? null,
      renewalAlertLastSentAt: null,
      fiscalValue: isRental ? null : Number(createLeaseDto.fiscalValue ?? 0),
      lateFeeType: isRental
        ? (createLeaseDto.lateFeeType ?? LateFeeType.NONE)
        : LateFeeType.NONE,
      lateFeeValue: isRental ? Number(createLeaseDto.lateFeeValue ?? 0) : 0,
      adjustmentValue: isRental ? createLeaseDto.adjustmentValue : 0,
      nextAdjustmentDate,
      draftContractText: null,
      draftContractFormat: null,
      confirmedContractText: null,
      confirmedContractFormat: null,
      confirmedAt: null,
      contractPdfUrl: null,
    };
  }

  async findAll(
    filters: LeaseFiltersDto,
    user?: RequestUser,
  ): Promise<{ data: Lease[]; total: number; page: number; limit: number }> {
    const {
      propertyId,
      tenantId,
      buyerId,
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
      .leftJoinAndSelect('property.owner', 'owner')
      .leftJoinAndSelect('owner.user', 'ownerUser')
      .leftJoinAndSelect('lease.tenant', 'tenant')
      .leftJoinAndSelect('tenant.user', 'tenantUser')
      .leftJoinAndSelect('lease.buyer', 'buyer')
      .leftJoinAndSelect('buyer.user', 'buyerUser')
      .where('lease.deleted_at IS NULL');

    if (propertyId) {
      query.andWhere('lease.property_id = :propertyId', { propertyId });
    }

    if (tenantId) {
      query.andWhere('lease.tenant_id = :tenantId', { tenantId });
    }

    if (buyerId) {
      query.andWhere('lease.buyer_id = :buyerId', { buyerId });
    }

    if (buyerProfileId) {
      query.andWhere('buyer.interested_profile_id = :buyerProfileId', {
        buyerProfileId,
      });
    }

    if (status) {
      query.andWhere('lease.status = :status', { status });
    } else if (includeFinalized) {
      query.andWhere('lease.status IN (:...statuses)', {
        statuses: [LeaseStatus.ACTIVE, LeaseStatus.FINALIZED],
      });
    } else {
      query.andWhere('lease.status = :activeStatus', {
        activeStatus: LeaseStatus.ACTIVE,
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

    if (user) {
      this.applyVisibilityScope(query, user);
    }

    query
      .orderBy('lease.createdAt', 'DESC')
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
        'buyer',
        'buyer.user',
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

  async findOneScoped(id: string, user: RequestUser): Promise<Lease> {
    const query = this.leasesRepository
      .createQueryBuilder('lease')
      .leftJoinAndSelect('lease.property', 'property')
      .leftJoinAndSelect('property.owner', 'owner')
      .leftJoinAndSelect('owner.user', 'ownerUser')
      .leftJoinAndSelect('lease.tenant', 'tenant')
      .leftJoinAndSelect('tenant.user', 'tenantUser')
      .leftJoinAndSelect('lease.buyer', 'buyer')
      .leftJoinAndSelect('buyer.user', 'buyerUser')
      .leftJoinAndSelect('lease.template', 'template')
      .leftJoinAndSelect('lease.previousLease', 'previousLease')
      .leftJoinAndSelect('lease.amendments', 'amendments')
      .where('lease.id = :id', { id })
      .andWhere('lease.deleted_at IS NULL');

    this.applyVisibilityScope(query, user);

    const lease = await query.getOne();
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

    const { content, format } = this.renderTemplateBody(
      template.templateBody,
      lease,
      template.templateFormat,
    );
    lease.templateId = template.id;
    lease.templateName = template.name;
    lease.draftContractText = content;
    lease.draftContractFormat = format;
    await this.leasesRepository.save(lease);
    return this.findOne(lease.id);
  }

  async updateDraftText(
    id: string,
    draftText: string,
    draftFormat?: LeaseContentFormat,
  ): Promise<Lease> {
    const lease = await this.findOne(id);
    if (lease.status !== LeaseStatus.DRAFT) {
      throw new BadRequestException('Only draft contracts can be edited');
    }

    const nextFormat = draftFormat ?? lease.draftContractFormat ?? 'plain_text';
    lease.draftContractText = this.normalizeContractBody(draftText, nextFormat);
    lease.draftContractFormat = nextFormat;
    await this.leasesRepository.save(lease);
    return this.findOne(id);
  }

  async confirmDraft(
    id: string,
    userId: string,
    finalText?: string,
    finalFormat?: LeaseContentFormat,
  ): Promise<Lease> {
    const lease = await this.findOne(id);
    if (lease.status !== LeaseStatus.DRAFT) {
      throw new BadRequestException('Only draft contracts can be confirmed');
    }

    const formatToConfirm =
      finalFormat ?? lease.draftContractFormat ?? 'plain_text';
    const contentToConfirm = this.normalizeContractBody(
      finalText ?? lease.draftContractText ?? '',
      formatToConfirm,
    );
    if (!contentToConfirm) {
      throw new BadRequestException('Contract draft text is required');
    }

    const resolvedContent = this.resolveContractContent(
      contentToConfirm,
      this.buildTemplateContext(lease),
      formatToConfirm,
    );
    if (!resolvedContent) {
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
    lease.confirmedContractText = resolvedContent;
    lease.confirmedContractFormat = formatToConfirm;
    lease.draftContractText = resolvedContent;
    lease.draftContractFormat = formatToConfirm;

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

    if (savedLease.contractType === ContractType.RENTAL) {
      await this.tenantAccountsService.createForLease(savedLease.id);
    }

    try {
      const document = await this.pdfService.generateContract(
        savedLease,
        userId,
        resolvedContent,
        formatToConfirm,
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

    if (
      oldLease.status !== LeaseStatus.ACTIVE &&
      oldLease.status !== LeaseStatus.FINALIZED
    ) {
      throw new BadRequestException(
        'Only active or finalized contracts can be renewed',
      );
    }

    if (oldLease.status === LeaseStatus.ACTIVE) {
      oldLease.status = LeaseStatus.FINALIZED;
      await this.leasesRepository.save(oldLease);
    }

    const oldStartDate = oldLease.startDate ?? null;
    const oldEndDate = oldLease.endDate ?? null;
    const fallbackStartDate = oldEndDate
      ? this.toIsoDate(oldEndDate)
      : this.toIsoDate(new Date());
    const resolvedStartDate = newTerms.startDate || fallbackStartDate;
    const resolvedEndDate =
      newTerms.endDate ||
      this.computeRenewedEndDate(resolvedStartDate, oldStartDate, oldEndDate);

    const payload: CreateLeaseDto = {
      companyId: oldLease.companyId,
      propertyId: oldLease.propertyId as string,
      tenantId: oldLease.tenantId ?? undefined,
      buyerId: oldLease.buyerId ?? undefined,
      ownerId: oldLease.ownerId,
      contractType: oldLease.contractType,
      startDate: resolvedStartDate,
      endDate: resolvedEndDate,
      monthlyRent: newTerms.monthlyRent ?? Number(oldLease.monthlyRent ?? 0),
      fiscalValue: newTerms.fiscalValue ?? Number(oldLease.fiscalValue ?? 0),
      currency: newTerms.currency || oldLease.currency,
      paymentFrequency: newTerms.paymentFrequency || oldLease.paymentFrequency,
      paymentDueDay: newTerms.paymentDueDay || oldLease.paymentDueDay,
      renewalAlertEnabled:
        newTerms.renewalAlertEnabled ?? oldLease.renewalAlertEnabled,
      renewalAlertPeriodicity:
        newTerms.renewalAlertPeriodicity ?? oldLease.renewalAlertPeriodicity,
      renewalAlertCustomDays:
        newTerms.renewalAlertCustomDays ??
        oldLease.renewalAlertCustomDays ??
        undefined,
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

  private computeRenewedEndDate(
    nextStartDate: string,
    oldStartDate: Date | null,
    oldEndDate: Date | null,
  ): string {
    const start = new Date(nextStartDate);
    if (Number.isNaN(start.getTime())) {
      return nextStartDate;
    }

    if (oldStartDate && oldEndDate) {
      const originalDurationMs = oldEndDate.getTime() - oldStartDate.getTime();
      if (originalDurationMs > 0) {
        return this.toIsoDate(new Date(start.getTime() + originalDurationMs));
      }
    }

    const fallback = new Date(start);
    fallback.setFullYear(fallback.getFullYear() + 1);
    return this.toIsoDate(fallback);
  }

  private toIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private truncateText(value: string, maxLength: number): string {
    return value.length > maxLength ? value.slice(0, maxLength) : value;
  }

  async listTemplates(
    companyId: string,
    contractType?: ContractType,
  ): Promise<LeaseContractTemplate[]> {
    const query = this.templatesRepository
      .createQueryBuilder('template')
      .where('template.company_id = :companyId', { companyId })
      .andWhere('template.deleted_at IS NULL')
      .orderBy('template.updatedAt', 'DESC');

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
    const templateFormat = dto.templateFormat ?? 'plain_text';
    const template = this.templatesRepository.create({
      companyId,
      name: dto.name.trim(),
      contractType: dto.contractType,
      templateBody: this.normalizeContractBody(
        dto.templateBody,
        templateFormat,
      ),
      templateFormat,
      sourceFileName: null,
      sourceMimeType: null,
      isActive: dto.isActive ?? true,
    });
    return this.templatesRepository.save(template);
  }

  async importTemplateFromDocx(
    file: UploadedLeaseFile,
    dto: ImportLeaseTemplateDocxDto,
    _companyId: string,
  ): Promise<Partial<LeaseContractTemplate>> {
    if (!file) {
      throw new BadRequestException('DOCX file is required');
    }
    if (
      file.mimetype !==
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      throw new BadRequestException('Only .docx files are supported');
    }

    const converted = await mammoth.convertToHtml({
      buffer: file.buffer,
    });
    const sourceFileName = this.truncateText(
      file.originalname,
      LEASE_TEMPLATE_SOURCE_FILE_NAME_MAX_LENGTH,
    );
    const sourceMimeType = this.truncateText(
      file.mimetype,
      LEASE_TEMPLATE_SOURCE_MIME_TYPE_MAX_LENGTH,
    );

    return {
      name:
        dto.name?.trim() ||
        file.originalname.replace(/\.docx$/i, '').slice(0, 120),
      contractType: dto.contractType,
      templateBody: this.normalizeContractBody(converted.value, 'html'),
      templateFormat: 'html',
      sourceFileName,
      sourceMimeType,
      isActive: true,
    };
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
    if (dto.templateFormat !== undefined)
      template.templateFormat = dto.templateFormat;
    if (dto.templateBody !== undefined)
      template.templateBody = this.normalizeContractBody(
        dto.templateBody,
        dto.templateFormat ?? template.templateFormat,
      );
    if (dto.isActive !== undefined) template.isActive = dto.isActive;

    return this.templatesRepository.save(template);
  }

  async importCurrentContract(
    file: UploadedLeaseFile,
    dto: ImportCurrentLeaseDto,
    companyId: string,
  ): Promise<Lease> {
    if (!file) {
      throw new BadRequestException('Contract file is required');
    }

    const contractType = dto.contractType ?? ContractType.RENTAL;
    const property = await this.findPropertyOrThrow(dto.propertyId);
    await this.ensureImportContractParty(dto, property.id, contractType);

    const extractedContract = await this.extractTextFromUploadedContract(file);
    const lease = this.buildImportedLeaseEntity(
      dto,
      companyId,
      property,
      contractType,
      extractedContract,
    );

    const savedLease = await this.leasesRepository.save(lease);
    const document = await this.createUploadedContractDocument(
      savedLease,
      file,
      companyId,
    );

    savedLease.contractPdfUrl = document.fileUrl;
    await this.leasesRepository.save(savedLease);
    await this.syncImportedLeasePropertyState(savedLease);

    return this.findOne(savedLease.id);
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
      buyerId: original.buyerId,
      ownerId: original.ownerId,
      leaseNumber: original.leaseNumber,
      contractType: original.contractType,
      startDate: original.startDate,
      endDate: original.endDate,
      monthlyRent: original.monthlyRent,
      currency: original.currency,
      paymentFrequency: original.paymentFrequency,
      paymentDueDay: original.paymentDueDay,
      renewalAlertEnabled: original.renewalAlertEnabled,
      renewalAlertPeriodicity: original.renewalAlertPeriodicity,
      renewalAlertCustomDays: original.renewalAlertCustomDays,
      renewalAlertLastSentAt: original.renewalAlertLastSentAt,
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
      draftContractFormat:
        original.confirmedContractFormat ??
        original.draftContractFormat ??
        null,
      notes: original.notes,
      status: LeaseStatus.DRAFT,
      previousLeaseId: original.id,
      versionNumber: Number(original.versionNumber ?? 1) + 1,
      confirmedAt: null,
      confirmedContractText: null,
      confirmedContractFormat: null,
      contractPdfUrl: null,
    });

    await this.applyUpdateToLease(revision, dto, effectiveType);
    const saved = await this.leasesRepository.save(revision);

    if (saved.templateId) {
      return this.renderDraft(saved.id, saved.templateId);
    }

    if (!saved.draftContractText && original.confirmedContractText) {
      saved.draftContractText = original.confirmedContractText;
      saved.draftContractFormat =
        original.confirmedContractFormat ??
        original.draftContractFormat ??
        null;
      await this.leasesRepository.save(saved);
    }

    return this.findOne(saved.id);
  }

  private async applyUpdateToLease(
    lease: Lease,
    dto: UpdateLeaseDto,
    effectiveType: ContractType,
  ): Promise<void> {
    await this.normalizeBuyerInputs(dto);
    const previousContractType = lease.contractType;
    this.validateContractTypeTransition(lease, dto, effectiveType);
    await this.applyPropertyUpdate(lease, dto);
    await this.applyTemplateUpdate(
      lease,
      dto,
      effectiveType,
      previousContractType,
    );
    this.applyCoreLeaseUpdate(lease, dto, effectiveType);
    this.resetRentalFieldsWhenSale(lease, effectiveType);
  }

  private async validateCreateForContractType(
    contractType: ContractType,
    dto: CreateLeaseDto,
    propertyId: string,
  ): Promise<void> {
    if (contractType === ContractType.RENTAL) {
      this.validateRentalCreate(dto);
      await this.ensureNoActiveRentalLease(propertyId);
      await this.ensureNoOpenLeaseForParty(
        propertyId,
        contractType,
        dto.tenantId ?? undefined,
      );
      return;
    }

    await this.normalizeBuyerInputs(dto);
    await this.validateSaleCreate(dto);
    await this.ensureNoOpenLeaseForParty(
      propertyId,
      contractType,
      undefined,
      dto.buyerId ?? undefined,
    );
  }

  private async ensureNoActiveRentalLease(propertyId: string): Promise<void> {
    const existingActiveLease = await this.leasesRepository.findOne({
      where: {
        propertyId,
        contractType: ContractType.RENTAL,
        status: LeaseStatus.ACTIVE,
        deletedAt: IsNull(),
      },
    });

    if (existingActiveLease) {
      throw new ConflictException('Property already has an active contract');
    }
  }

  private async ensureNoOpenLeaseForParty(
    propertyId: string,
    contractType: ContractType,
    tenantId?: string,
    buyerId?: string,
  ): Promise<void> {
    if (contractType === ContractType.RENTAL && !tenantId) {
      return;
    }

    if (contractType === ContractType.SALE && !buyerId) {
      return;
    }

    const existingLeaseQuery = this.leasesRepository
      .createQueryBuilder('lease')
      .where('lease.property_id = :propertyId', { propertyId })
      .andWhere('lease.contract_type = :contractType', { contractType })
      .andWhere('lease.status IN (:...statuses)', {
        statuses: [LeaseStatus.DRAFT, LeaseStatus.ACTIVE],
      })
      .andWhere('lease.deleted_at IS NULL')
      .orderBy('lease.updatedAt', 'DESC');

    if (contractType === ContractType.RENTAL) {
      existingLeaseQuery.andWhere('lease.tenant_id = :tenantId', { tenantId });
    } else {
      existingLeaseQuery.andWhere('lease.buyer_id = :buyerId', {
        buyerId,
      });
    }

    const existingLease = await existingLeaseQuery.getOne();

    if (existingLease) {
      throw new ConflictException(
        'An open contract already exists for this property and party',
      );
    }
  }

  private validateContractTypeTransition(
    lease: Lease,
    dto: UpdateLeaseDto,
    effectiveType: ContractType,
  ): void {
    if (effectiveType === ContractType.RENTAL) {
      this.validateRentalDates(
        dto.startDate ?? lease.startDate?.toISOString(),
        dto.endDate ?? lease.endDate?.toISOString(),
      );
      return;
    }

    if (!dto.buyerId && !lease.buyerId) {
      throw new BadRequestException('Sale contracts require buyerId');
    }
    if (
      dto.fiscalValue === undefined &&
      (lease.fiscalValue === undefined || lease.fiscalValue === null)
    ) {
      throw new BadRequestException('Sale contracts require fiscalValue');
    }
  }

  private async applyPropertyUpdate(
    lease: Lease,
    dto: UpdateLeaseDto,
  ): Promise<void> {
    if (!dto.propertyId) {
      return;
    }

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

  private async applyTemplateUpdate(
    lease: Lease,
    dto: UpdateLeaseDto,
    effectiveType: ContractType,
    previousContractType: ContractType,
  ): Promise<void> {
    if (dto.templateId !== undefined) {
      if (!dto.templateId) {
        lease.templateId = null;
        lease.templateName = null;
        return;
      }

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
      return;
    }

    if (
      dto.contractType !== undefined &&
      previousContractType !== effectiveType
    ) {
      const resolvedTemplate = await this.resolveTemplateForLease(
        lease.companyId,
        effectiveType,
      );
      lease.templateId = resolvedTemplate?.id ?? null;
      lease.templateName = resolvedTemplate?.name ?? null;
    }
  }

  private applyCoreLeaseUpdate(
    lease: Lease,
    dto: UpdateLeaseDto,
    effectiveType: ContractType,
  ): void {
    let resolvedEndDate: Date | null | undefined = lease.endDate;
    if (dto.endDate !== undefined) {
      resolvedEndDate = dto.endDate ? new Date(dto.endDate) : null;
    }

    let resolvedStartDate: Date | null | undefined = lease.startDate;
    if (dto.startDate !== undefined) {
      resolvedStartDate = dto.startDate ? new Date(dto.startDate) : null;
    }

    Object.assign(lease, {
      ...dto,
      contractType: effectiveType,
      startDate: resolvedStartDate,
      endDate: resolvedEndDate,
    });
  }

  private resetRentalFieldsWhenSale(
    lease: Lease,
    effectiveType: ContractType,
  ): void {
    if (effectiveType !== ContractType.SALE) {
      lease.buyerId = null;
      return;
    }

    lease.tenantId = null;
    lease.monthlyRent = null;
    lease.startDate = null;
    lease.endDate = null;
    lease.renewalAlertEnabled = false;
    lease.renewalAlertCustomDays = null;
    lease.renewalAlertLastSentAt = null;
    lease.lateFeeType = LateFeeType.NONE;
    lease.lateFeeValue = 0;
    lease.adjustmentValue = 0;
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

  private async resolveTemplateForLease(
    companyId: string,
    contractType: ContractType,
    requestedTemplateId?: string,
  ): Promise<LeaseContractTemplate | null> {
    if (requestedTemplateId) {
      return this.findTemplate(requestedTemplateId, companyId, contractType);
    }

    const candidates = await this.templatesRepository.find({
      where: {
        companyId,
        contractType,
        isActive: true,
        deletedAt: IsNull(),
      },
      order: { updatedAt: 'DESC' },
      take: 2,
    });

    return candidates.length === 1 ? candidates[0] : null;
  }

  private renderTemplateBody(
    templateBody: string,
    lease: Lease,
    templateFormat: LeaseContentFormat = 'plain_text',
  ): { content: string; format: LeaseContentFormat } {
    const context = this.buildTemplateContext(lease);

    if (templateFormat === 'html') {
      return {
        content: this.normalizeContractBody(
          this.replaceTemplateTokens(templateBody, context, undefined, true),
          'html',
        ),
        format: 'html',
      };
    }

    return {
      content: this.replaceTemplateVariables(templateBody, context, true),
      format: 'plain_text',
    };
  }

  private resolveContractContent(
    contractBody: string,
    context: Record<string, unknown>,
    format: LeaseContentFormat,
  ): string {
    if (format === 'html') {
      return this.normalizeContractBody(
        this.replaceTemplateTokens(contractBody, context, undefined, true),
        'html',
      );
    }

    return this.replaceTemplateVariables(contractBody, context, false);
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
        firstName: lease.buyer?.user?.firstName,
        lastName: lease.buyer?.user?.lastName,
        fullName:
          `${lease.buyer?.user?.firstName ?? ''} ${lease.buyer?.user?.lastName ?? ''}`.trim() ||
          null,
        email: lease.buyer?.user?.email,
        phone: lease.buyer?.user?.phone,
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
      const rendered = this.replaceTemplateTokens(paragraph, context, () => {
        hasMissingValue = true;
      });

      if (
        (!dropParagraphsWithMissingValues || !hasMissingValue) &&
        rendered.trim().length > 0
      ) {
        renderedParagraphs.push(rendered.trim());
      }
    }

    return renderedParagraphs.join('\n\n');
  }

  private replaceTemplateTokens(
    templateBody: string,
    context: Record<string, unknown>,
    onMissingValue?: () => void,
    escapeForHtml: boolean = false,
  ): string {
    return templateBody.replaceAll(
      /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}|\{([a-zA-Z0-9_.]+)\}/g,
      (_full, keyWithDoubleBraces?: string, keyWithSingleBraces?: string) => {
        const key = keyWithDoubleBraces ?? keyWithSingleBraces;
        if (!key) {
          return '';
        }
        const value = this.resolveTemplateValue(context, key);
        if (!this.isTemplateRenderableValue(value)) {
          onMissingValue?.();
          return '';
        }

        const stringValue = String(value);
        return escapeForHtml ? this.escapeHtml(stringValue) : stringValue;
      },
    );
  }

  private async ensureImportContractParty(
    dto: ImportCurrentLeaseDto,
    propertyId: string,
    contractType: ContractType,
  ): Promise<void> {
    if (contractType === ContractType.RENTAL) {
      if (!dto.tenantId) {
        throw new BadRequestException('Rental imports require tenantId');
      }

      await this.ensureNoActiveRentalLease(propertyId);
      await this.ensureNoOpenLeaseForParty(
        propertyId,
        contractType,
        dto.tenantId,
      );
      return;
    }

    await this.normalizeBuyerInputs(dto);
    if (!dto.buyerId) {
      throw new BadRequestException('Sale imports require buyerId');
    }

    const buyer = await this.buyersRepository.findOne({
      where: { id: dto.buyerId, deletedAt: IsNull() },
      relations: ['user'],
    });
    if (!buyer) {
      throw new NotFoundException('Buyer not found');
    }

    await this.ensureNoOpenLeaseForParty(
      propertyId,
      contractType,
      undefined,
      dto.buyerId,
    );
  }

  private buildImportedLeaseEntity(
    dto: ImportCurrentLeaseDto,
    companyId: string,
    property: Property,
    contractType: ContractType,
    extractedContract: { content: string; format: LeaseContentFormat },
  ): Lease {
    const currency = dto.currency?.trim() || 'ARS';

    return this.leasesRepository.create({
      companyId,
      propertyId: property.id,
      ownerId: dto.ownerId || property.ownerId,
      tenantId:
        contractType === ContractType.RENTAL ? (dto.tenantId ?? null) : null,
      buyerId:
        contractType === ContractType.SALE ? (dto.buyerId ?? null) : null,
      contractType,
      status: LeaseStatus.ACTIVE,
      startDate:
        contractType === ContractType.RENTAL && dto.startDate
          ? new Date(dto.startDate)
          : null,
      endDate:
        contractType === ContractType.RENTAL && dto.endDate
          ? new Date(dto.endDate)
          : null,
      monthlyRent:
        contractType === ContractType.RENTAL
          ? this.parseOptionalNumber(dto.monthlyRent)
          : null,
      fiscalValue:
        contractType === ContractType.SALE
          ? this.parseOptionalNumber(dto.fiscalValue)
          : null,
      securityDeposit: this.parseOptionalNumber(dto.securityDeposit),
      currency,
      depositCurrency: currency,
      paymentFrequency: PaymentFrequency.MONTHLY,
      paymentDueDay: 10,
      renewalAlertEnabled: true,
      renewalAlertPeriodicity: LeaseRenewalAlertPeriodicity.MONTHLY,
      billingFrequency: BillingFrequency.FIRST_OF_MONTH,
      autoGenerateInvoices: contractType === ContractType.RENTAL,
      lateFeeType: LateFeeType.NONE,
      lateFeeValue: 0,
      draftContractText: extractedContract.content,
      draftContractFormat: extractedContract.format,
      confirmedContractText: extractedContract.content,
      confirmedContractFormat: extractedContract.format,
      confirmedAt: new Date(),
      templateId: null,
      templateName: null,
      previousLeaseId: null,
      versionNumber: 1,
      contractPdfUrl: null,
      notes: dto.notes?.trim() || null,
    } as Partial<Lease>);
  }

  private async syncImportedLeasePropertyState(lease: Lease): Promise<void> {
    if (!lease.propertyId) {
      return;
    }

    if (lease.contractType === ContractType.RENTAL) {
      await this.propertiesRepository.update(lease.propertyId, {
        operationState: PropertyOperationState.RENTED,
      });
      await this.tenantAccountsService.createForLease(lease.id);
      return;
    }

    if (lease.contractType === ContractType.SALE) {
      await this.propertiesRepository.update(lease.propertyId, {
        operationState: PropertyOperationState.SOLD,
      });
    }
  }

  private parseOptionalNumber(value?: string): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw new BadRequestException('Invalid numeric value');
    }

    return parsed;
  }

  private async extractTextFromUploadedContract(
    file: UploadedLeaseFile,
  ): Promise<{ content: string; format: LeaseContentFormat }> {
    const extension = this.getUploadedFileExtension(file.originalname);
    this.ensureSupportedContractFile(file, extension);

    if (extension === 'docx') {
      const extracted = await mammoth.convertToHtml({
        buffer: file.buffer,
      });

      return {
        content: this.normalizeContractBody(extracted.value, 'html'),
        format: 'html',
      };
    }

    if (extension === 'md') {
      return {
        content: this.normalizeContractBody(
          await this.renderMarkdownAsHtml(file.buffer.toString('utf-8')),
          'html',
        ),
        format: 'html',
      };
    }

    if (extension === 'txt') {
      return {
        content: this.normalizeContractBody(
          this.plainTextToHtml(file.buffer.toString('utf-8')),
          'html',
        ),
        format: 'html',
      };
    }

    if (extension === 'doc') {
      const html = await this.convertLegacyWordDocumentToHtml(file);
      return {
        content: this.normalizeContractBody(html, 'html'),
        format: 'html',
      };
    }

    if (extension === 'pdf') {
      return {
        content: this.normalizeContractBody(
          await this.convertPdfDocumentToHtml(file),
          'html',
        ),
        format: 'html',
      };
    }

    throw new BadRequestException(
      'Only md, doc, docx, txt and pdf contracts are accepted',
    );
  }

  private ensureSupportedContractFile(
    file: UploadedLeaseFile,
    extension: string,
  ): void {
    const supportedExtensions = new Set(['md', 'doc', 'docx', 'txt', 'pdf']);
    if (!supportedExtensions.has(extension)) {
      throw new BadRequestException(
        'Only md, doc, docx, txt and pdf contracts are accepted',
      );
    }

    if (file.mimetype?.startsWith('image/')) {
      throw new BadRequestException(
        'Image-based contracts are not supported because OCR is not allowed for this flow',
      );
    }
  }

  private async convertLegacyWordDocumentToHtml(
    file: UploadedLeaseFile,
  ): Promise<string> {
    const tempDir = await mkdtemp(join(tmpdir(), 'rent-legacy-doc-'));
    const sourcePath = join(tempDir, 'contract.doc');
    const expectedHtmlPath = join(tempDir, 'contract.html');

    try {
      await writeFile(sourcePath, file.buffer);
      await execFile(
        'soffice',
        [
          '--headless',
          '--convert-to',
          'html:HTML',
          '--outdir',
          tempDir,
          sourcePath,
        ],
        {
          timeout: 30_000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );

      const html = await readFile(expectedHtmlPath, 'utf-8');
      return this.extractHtmlBody(html);
    } catch {
      throw new BadRequestException(
        'The .doc contract could not be interpreted as rich text',
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async convertPdfDocumentToHtml(
    file: UploadedLeaseFile,
  ): Promise<string> {
    const tempDir = await mkdtemp(join(tmpdir(), 'rent-pdf-html-'));
    const sourcePath = join(tempDir, 'contract.pdf');

    try {
      await writeFile(sourcePath, file.buffer);
      const { stdout } = await execFile(
        'pdftohtml',
        ['-s', '-noframes', '-i', '-stdout', sourcePath],
        {
          timeout: 30_000,
          maxBuffer: 20 * 1024 * 1024,
        },
      );

      const html = this.extractHtmlBody(stdout);
      if (!html.trim()) {
        throw new BadRequestException(
          'The PDF contract could not be interpreted as rich text',
        );
      }

      return html;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        'The PDF contract could not be interpreted as rich text',
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private extractHtmlBody(value: string): string {
    const root = parseHtml(value);
    const body = root.querySelector('body');
    return (body?.innerHTML ?? value).trim();
  }

  private async createUploadedContractDocument(
    lease: Lease,
    file: UploadedLeaseFile,
    companyId: string,
  ): Promise<Document> {
    const document = await this.documentsRepository.save(
      this.documentsRepository.create({
        companyId,
        entityType: 'lease',
        entityId: lease.id,
        documentType: DocumentType.LEASE_CONTRACT,
        name: file.originalname,
        description: 'Contrato importado manualmente',
        fileUrl: 'db://document/pending',
        fileData: file.buffer,
        fileSize: file.size,
        fileMimeType: file.mimetype,
        status: DocumentStatus.APPROVED,
        metadata: {
          imported: true,
          contractType: lease.contractType,
          draftContractFormat: lease.draftContractFormat,
        },
      }),
    );

    document.fileUrl = `db://document/${document.id}`;
    return this.documentsRepository.save(document);
  }

  private normalizeContractBody(
    value: string,
    format: LeaseContentFormat,
  ): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException(
        'The contract content could not be interpreted',
      );
    }

    if (format === 'html') {
      const root = parseHtml(normalized);
      const textContent = root.text.trim();
      if (!textContent) {
        throw new BadRequestException(
          'The contract content could not be interpreted',
        );
      }
      return normalized;
    }

    return normalized;
  }

  private async renderMarkdownAsHtml(markdown: string): Promise<string> {
    const { marked } = await import('marked');
    const rendered = await marked.parse(markdown);

    if (typeof rendered !== 'string') {
      throw new BadRequestException(
        'Unable to interpret markdown contract contents',
      );
    }

    return rendered;
  }

  private getUploadedFileExtension(filename: string): string {
    const normalized = filename.trim().toLowerCase();
    const parts = normalized.split('.');
    return parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
  }

  private plainTextToHtml(value: string): string {
    const normalized = value.replaceAll('\r\n', '\n').trim();
    if (!normalized) {
      return '';
    }

    return normalized
      .split(/\n{2,}/)
      .map((paragraph) => {
        const escaped = this.escapeHtml(paragraph.trim()).replaceAll(
          '\n',
          '<br />',
        );
        return `<p>${escaped}</p>`;
      })
      .join('');
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
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

  private isTemplateRenderableValue(
    value: unknown,
  ): value is string | number | boolean | bigint {
    return !(
      value === null ||
      value === undefined ||
      value === '' ||
      typeof value === 'function' ||
      typeof value === 'symbol' ||
      typeof value === 'object'
    );
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
    if (!dto.buyerId) {
      throw new BadRequestException('Sale contracts require buyerId');
    }
    if (dto.fiscalValue === undefined || dto.fiscalValue === null) {
      throw new BadRequestException('Sale contracts require fiscalValue');
    }

    const buyer = await this.buyersRepository.findOne({
      where: { id: dto.buyerId, deletedAt: IsNull() },
    });
    if (!buyer) {
      throw new NotFoundException('Buyer not found');
    }
  }

  private async normalizeBuyerInputs(
    dto: Pick<CreateLeaseDto, 'buyerId' | 'buyerProfileId'>,
  ): Promise<void> {
    if (dto.buyerId) {
      return;
    }

    if (!dto.buyerProfileId) {
      return;
    }

    const interestedProfile = await this.interestedProfilesRepository.findOne({
      where: { id: dto.buyerProfileId, deletedAt: IsNull() },
    });

    if (!interestedProfile) {
      throw new NotFoundException('Interested buyer profile not found');
    }

    if (!interestedProfile.convertedToBuyerId) {
      throw new BadRequestException(
        'Interested buyer profile must be converted before creating a sale contract',
      );
    }

    dto.buyerId = interestedProfile.convertedToBuyerId;
  }

  private applyVisibilityScope(
    query: SelectQueryBuilder<Lease>,
    user: RequestUser,
  ) {
    if (user.role === UserRole.ADMIN || user.role === UserRole.STAFF) {
      return;
    }

    const email = (user.email ?? '').trim().toLowerCase();
    const phone = (user.phone ?? '').trim();

    if (user.role === UserRole.OWNER) {
      query.andWhere(
        `(owner.user_id = :scopeUserId OR LOWER(ownerUser.email) = :scopeEmail OR (:scopePhone <> '' AND ownerUser.phone = :scopePhone))`,
        {
          scopeUserId: user.id,
          scopeEmail: email,
          scopePhone: phone,
        },
      );
      return;
    }

    if (user.role === UserRole.TENANT) {
      query.andWhere(
        `(tenant.user_id = :scopeUserId OR LOWER(tenantUser.email) = :scopeEmail OR (:scopePhone <> '' AND tenantUser.phone = :scopePhone))`,
        {
          scopeUserId: user.id,
          scopeEmail: email,
          scopePhone: phone,
        },
      );
      return;
    }

    if (user.role === UserRole.BUYER) {
      query.andWhere(
        `(buyer.user_id = :scopeUserId OR LOWER(buyerUser.email) = :scopeEmail OR (:scopePhone <> '' AND buyerUser.phone = :scopePhone))`,
        {
          scopeUserId: user.id,
          scopeEmail: email,
          scopePhone: phone,
        },
      );
    }
  }
}
