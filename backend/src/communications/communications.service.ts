import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import {
  WhatsappRelatedEntityType,
  WhatsappService,
} from '../whatsapp/whatsapp.service';
import {
  CommunicationChannel,
  CommunicationEvent,
  CommunicationRecipientRole,
  CommunicationTemplate,
} from './entities/communication-template.entity';
import {
  CommunicationDelivery,
  CommunicationDeliveryStatus,
} from './entities/communication-delivery.entity';
import {
  CreateCommunicationTemplateDto,
  PreviewCommunicationDto,
  TestCommunicationDto,
  UpdateCommunicationTemplateDto,
} from './dto/communication-template.dto';

type TemplateVariable = string | number | boolean | null | undefined;

export type DispatchCommunicationInput = {
  companyId: string;
  event: CommunicationEvent;
  recipientRole: CommunicationRecipientRole;
  recipientId?: string | null;
  channel: CommunicationChannel;
  recipient: string;
  locale?: string;
  variables: Record<string, TemplateVariable>;
  fallbackSubject?: string | null;
  fallbackBody: string;
  consented: boolean;
  relatedEntityType?: string;
  relatedEntityId?: string;
  forceSend?: boolean;
  metadata?: Record<string, unknown>;
  skipTemplateLookup?: boolean;
};

@Injectable()
export class CommunicationsService {
  constructor(
    @InjectRepository(CommunicationTemplate)
    private readonly templatesRepository: Repository<CommunicationTemplate>,
    @InjectRepository(CommunicationDelivery)
    private readonly deliveriesRepository: Repository<CommunicationDelivery>,
    private readonly whatsappService: WhatsappService,
  ) {}

  assertBatchToken(token?: string): void {
    const expected =
      process.env.BATCH_COMMUNICATIONS_INTERNAL_TOKEN?.trim() ?? '';
    if (!expected) {
      throw new ServiceUnavailableException(
        'Batch communications token is not configured',
      );
    }
    if (!token || token !== expected) {
      throw new UnauthorizedException('Invalid batch communications token');
    }
  }

  listTemplates(companyId: string): Promise<CommunicationTemplate[]> {
    return this.templatesRepository.find({
      where: { companyId },
      order: { event: 'ASC', recipientRole: 'ASC', channel: 'ASC' },
    });
  }

  listDeliveries(companyId: string): Promise<CommunicationDelivery[]> {
    return this.deliveriesRepository.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async createTemplate(
    companyId: string,
    dto: CreateCommunicationTemplateDto,
  ): Promise<CommunicationTemplate> {
    return this.templatesRepository.save(
      this.templatesRepository.create({
        ...dto,
        companyId,
        locale: dto.locale ?? 'es',
        isActive: dto.isActive ?? true,
        autoSend: dto.autoSend ?? true,
        requiresApproval: dto.requiresApproval ?? false,
        variables:
          dto.variables ??
          this.extractVariables(`${dto.subject ?? ''}\n${dto.body}`),
      }),
    );
  }

  async updateTemplate(
    id: string,
    companyId: string,
    dto: UpdateCommunicationTemplateDto,
  ): Promise<CommunicationTemplate> {
    const template = await this.findTemplate(id, companyId);
    Object.assign(template, dto);
    if (
      (dto.body || dto.subject !== undefined) &&
      dto.variables === undefined
    ) {
      template.variables = this.extractVariables(
        `${template.subject ?? ''}\n${template.body}`,
      );
    }
    return this.templatesRepository.save(template);
  }

  async preview(
    companyId: string,
    dto: PreviewCommunicationDto,
  ): Promise<{
    subject: string | null;
    body: string;
    missingVariables: string[];
  }> {
    const template = dto.templateId
      ? await this.findTemplate(dto.templateId, companyId)
      : null;
    const subject = dto.subject ?? template?.subject ?? null;
    const body = dto.body ?? template?.body;
    if (!body) throw new BadRequestException('Message body is required');

    const missingVariables = Array.from(
      new Set([
        ...this.extractVariables(subject ?? ''),
        ...this.extractVariables(body),
      ]),
    ).filter((key) => dto.variables[key] === undefined);

    return {
      subject: subject ? this.render(subject, dto.variables) : null,
      body: this.render(body, dto.variables),
      missingVariables,
    };
  }

  async sendTest(
    companyId: string,
    dto: TestCommunicationDto,
  ): Promise<CommunicationDelivery> {
    const rendered = await this.preview(companyId, dto);
    if (rendered.missingVariables.length > 0) {
      throw new BadRequestException(
        `Missing variables: ${rendered.missingVariables.join(', ')}`,
      );
    }
    return this.dispatchEvent({
      companyId,
      event: CommunicationEvent.PAYMENT_REMINDER,
      recipientRole: CommunicationRecipientRole.TENANT,
      channel: dto.channel,
      recipient: dto.recipient,
      variables: dto.variables,
      fallbackSubject: rendered.subject,
      fallbackBody: rendered.body,
      consented: true,
      forceSend: true,
      metadata: { test: true },
      skipTemplateLookup: true,
    });
  }

  async dispatchEvent(
    input: DispatchCommunicationInput,
  ): Promise<CommunicationDelivery> {
    const template = input.skipTemplateLookup
      ? null
      : await this.templatesRepository.findOne({
          where: {
            companyId: input.companyId,
            event: input.event,
            recipientRole: input.recipientRole,
            channel: input.channel,
            locale: input.locale ?? 'es',
            isActive: true,
          },
          order: { updatedAt: 'DESC' },
        });
    const subjectTemplate = template?.subject ?? input.fallbackSubject ?? null;
    const bodyTemplate = template?.body ?? input.fallbackBody;
    const status = this.resolveInitialStatus(input, template);

    let delivery = await this.deliveriesRepository.save(
      this.deliveriesRepository.create({
        companyId: input.companyId,
        templateId: template?.id ?? null,
        event: input.event,
        recipientRole: input.recipientRole,
        recipientId: input.recipientId ?? null,
        channel: input.channel,
        recipient: input.recipient,
        subject: subjectTemplate
          ? this.render(subjectTemplate, input.variables)
          : null,
        body: this.render(bodyTemplate, input.variables),
        status,
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt:
          status === CommunicationDeliveryStatus.QUEUED ? new Date() : null,
        providerMessageId: null,
        errorMessage:
          status === CommunicationDeliveryStatus.BLOCKED
            ? 'Recipient has not consented to this communication channel'
            : null,
        relatedEntityType: input.relatedEntityType ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
        metadata: input.metadata ?? {},
        sentAt: null,
      }),
    );

    if (delivery.status === CommunicationDeliveryStatus.QUEUED) {
      delivery = await this.attemptDelivery(delivery);
    }
    return delivery;
  }

  async approve(id: string, companyId: string): Promise<CommunicationDelivery> {
    const delivery = await this.findDelivery(id, companyId);
    if (delivery.status !== CommunicationDeliveryStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Delivery is not pending approval');
    }
    delivery.status = CommunicationDeliveryStatus.QUEUED;
    delivery.nextAttemptAt = new Date();
    await this.deliveriesRepository.save(delivery);
    return this.attemptDelivery(delivery);
  }

  async retry(id: string, companyId: string): Promise<CommunicationDelivery> {
    const delivery = await this.findDelivery(id, companyId);
    if (delivery.status !== CommunicationDeliveryStatus.FAILED) {
      throw new BadRequestException('Only failed deliveries can be retried');
    }
    delivery.status = CommunicationDeliveryStatus.QUEUED;
    delivery.nextAttemptAt = new Date();
    await this.deliveriesRepository.save(delivery);
    return this.attemptDelivery(delivery);
  }

  async retryDue(): Promise<{
    processed: number;
    sent: number;
    failed: number;
  }> {
    const deliveries = await this.deliveriesRepository.find({
      where: {
        status: CommunicationDeliveryStatus.FAILED,
        nextAttemptAt: LessThanOrEqual(new Date()),
      },
      take: 100,
      order: { nextAttemptAt: 'ASC' },
    });
    let sent = 0;
    let failed = 0;
    for (const delivery of deliveries) {
      if (delivery.attempts >= delivery.maxAttempts) continue;
      delivery.status = CommunicationDeliveryStatus.QUEUED;
      const result = await this.attemptDelivery(delivery);
      if (result.status === CommunicationDeliveryStatus.SENT) sent += 1;
      else failed += 1;
    }
    return { processed: deliveries.length, sent, failed };
  }

  private resolveInitialStatus(
    input: DispatchCommunicationInput,
    template: CommunicationTemplate | null,
  ): CommunicationDeliveryStatus {
    if (!input.consented) return CommunicationDeliveryStatus.BLOCKED;
    if (
      template?.requiresApproval ||
      (template && !template.autoSend && !input.forceSend)
    ) {
      return CommunicationDeliveryStatus.PENDING_APPROVAL;
    }
    return CommunicationDeliveryStatus.QUEUED;
  }

  private async attemptDelivery(
    delivery: CommunicationDelivery,
  ): Promise<CommunicationDelivery> {
    delivery.attempts += 1;
    try {
      delivery.providerMessageId = await this.send(delivery);
      delivery.status = CommunicationDeliveryStatus.SENT;
      delivery.sentAt = new Date();
      delivery.nextAttemptAt = null;
      delivery.errorMessage = null;
    } catch (error) {
      delivery.status = CommunicationDeliveryStatus.FAILED;
      delivery.errorMessage =
        error instanceof Error
          ? error.message
          : 'Communication provider failed';
      delivery.nextAttemptAt =
        delivery.attempts < delivery.maxAttempts
          ? new Date(Date.now() + 2 ** delivery.attempts * 60_000)
          : null;
    }
    return this.deliveriesRepository.save(delivery);
  }

  private async send(delivery: CommunicationDelivery): Promise<string | null> {
    if (delivery.channel === CommunicationChannel.WHATSAPP) {
      const result = await this.whatsappService.sendTextMessage(
        delivery.recipient,
        delivery.body,
        typeof delivery.metadata?.attachmentUrl === 'string'
          ? delivery.metadata.attachmentUrl
          : undefined,
        {
          companyId: delivery.companyId,
          relatedEntityType: this.toWhatsappEntityType(
            delivery.relatedEntityType,
          ),
          relatedEntityId: delivery.relatedEntityId ?? undefined,
        },
      );
      return result.messageId;
    }

    const prefix =
      delivery.channel === CommunicationChannel.EMAIL
        ? 'COMMUNICATION_EMAIL'
        : 'COMMUNICATION_SMS';
    const endpoint = process.env[`${prefix}_WEBHOOK_URL`]?.trim();
    if (!endpoint) {
      throw new BadGatewayException(`${prefix}_WEBHOOK_URL is not configured`);
    }
    const token = process.env[`${prefix}_WEBHOOK_TOKEN`]?.trim();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        to: delivery.recipient,
        subject: delivery.subject,
        text: delivery.body,
        metadata: {
          deliveryId: delivery.id,
          event: delivery.event,
          relatedEntityType: delivery.relatedEntityType,
          relatedEntityId: delivery.relatedEntityId,
        },
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      messageId?: string;
      error?: string;
    } | null;
    if (!response.ok) {
      throw new BadGatewayException(
        payload?.error ?? `Communication provider failed (${response.status})`,
      );
    }
    return payload?.messageId ?? payload?.id ?? null;
  }

  private toWhatsappEntityType(
    value: string | null,
  ): WhatsappRelatedEntityType | undefined {
    const allowed: WhatsappRelatedEntityType[] = [
      'tenant',
      'owner',
      'interested',
      'property_visit',
      'invoice',
      'payment',
      'lease',
    ];
    return allowed.find((item) => item === value);
  }

  private render(
    template: string,
    variables: Record<string, TemplateVariable>,
  ): string {
    return template.replace(
      /{{\s*([A-Za-z0-9_.]+)\s*}}/g,
      (_match, key: string) => {
        const value = variables[key];
        return value === undefined || value === null ? '' : String(value);
      },
    );
  }

  private extractVariables(template: string): string[] {
    return Array.from(template.matchAll(/{{\s*([A-Za-z0-9_.]+)\s*}}/g))
      .map((match) => match[1])
      .filter((value, index, values) => values.indexOf(value) === index);
  }

  private async findTemplate(id: string, companyId: string) {
    const template = await this.templatesRepository.findOne({
      where: { id, companyId },
    });
    if (!template) {
      throw new NotFoundException('Communication template not found');
    }
    return template;
  }

  private async findDelivery(id: string, companyId: string) {
    const delivery = await this.deliveriesRepository.findOne({
      where: { id, companyId },
    });
    if (!delivery) {
      throw new NotFoundException('Communication delivery not found');
    }
    return delivery;
  }
}
