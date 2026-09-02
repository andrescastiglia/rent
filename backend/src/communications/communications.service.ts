import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
    @InjectDataSource() private readonly dataSource: DataSource,
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

  listInbox(companyId: string) {
    return this.dataSource.query(
      `SELECT pc.id, pc.person_type AS "personType", pc.person_id AS "personId",
              pc.message_type AS "messageType", pc.body, pc.status,
              pc.created_at AS "createdAt", pc.metadata,
              concat_ws(' ', u.first_name, u.last_name) AS "personName",
              u.phone
         FROM person_communications pc
         LEFT JOIN users u ON u.id = pc.user_id
        WHERE pc.company_id = $1::uuid AND pc.direction = 'inbound'
        ORDER BY CASE WHEN pc.status = 'new' THEN 0 ELSE 1 END, pc.created_at DESC
        LIMIT 200`,
      [companyId],
    );
  }

  async markInboxRead(id: string, staff: { id: string; companyId: string }) {
    const rows = await this.dataSource.query(
      `UPDATE person_communications
          SET status = CASE WHEN status = 'new' THEN 'read' ELSE status END,
              read_at = COALESCE(read_at, now()), read_by = $3::uuid,
              updated_at = now()
        WHERE id = $1::uuid AND company_id = $2::uuid AND direction = 'inbound'
        RETURNING *`,
      [id, staff.companyId, staff.id],
    );
    if (!rows[0]) throw new NotFoundException('Communication not found');
    return rows[0];
  }

  async replyToInbox(
    id: string,
    staff: { id: string; companyId: string },
    body: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT pc.*, u.phone, u.whatsapp_enabled
         FROM person_communications pc
         JOIN users u ON u.id = pc.user_id
        WHERE pc.id = $1::uuid AND pc.company_id = $2::uuid
          AND pc.direction = 'inbound'`,
      [id, staff.companyId],
    );
    const incoming = rows[0];
    if (!incoming) throw new NotFoundException('Communication not found');
    if (!incoming.whatsapp_enabled) {
      throw new BadRequestException('The recipient revoked WhatsApp consent');
    }
    const sent = await this.whatsappService.sendTextMessage(
      incoming.phone,
      body.trim(),
      undefined,
      { companyId: staff.companyId },
    );
    const inserted = await this.dataSource.query(
      `INSERT INTO person_communications (
         company_id, user_id, person_type, person_id, direction, message_type,
         body, whatsapp_message_id, in_reply_to_id, status, read_at, read_by,
         metadata
       ) VALUES ($1::uuid, $2::uuid, $3, $4::uuid, 'outbound', 'text', $5,
                 $6, $7::uuid, 'read', now(), $8::uuid, $9::jsonb)
       RETURNING *`,
      [
        staff.companyId,
        incoming.user_id,
        incoming.person_type,
        incoming.person_id,
        body.trim(),
        sent.messageId,
        id,
        staff.id,
        JSON.stringify({ repliedBy: staff.id }),
      ],
    );
    await this.dataSource.query(
      `UPDATE person_communications SET status = 'replied',
              read_at = COALESCE(read_at, now()), read_by = $2::uuid,
              updated_at = now() WHERE id = $1::uuid`,
      [id, staff.id],
    );
    await this.recordReplyActivity(incoming, staff.id, body.trim());
    return inserted[0];
  }

  private async recordReplyActivity(
    incoming: Record<string, unknown>,
    staffId: string,
    body: string,
  ): Promise<void> {
    const personType = String(incoming.person_type);
    const personId = incoming.person_id;
    if (!personId || !['owner', 'tenant', 'interested'].includes(personType))
      return;
    const table =
      personType === 'owner'
        ? 'owner_activities'
        : personType === 'tenant'
          ? 'tenant_activities'
          : 'interested_activities';
    const personColumn =
      personType === 'interested'
        ? 'interested_profile_id'
        : `${personType}_id`;
    const companyColumns = personType === 'interested' ? '' : 'company_id,';
    const companyValues = personType === 'interested' ? '' : '$2::uuid,';
    await this.dataSource.query(
      `INSERT INTO ${table} (${companyColumns} ${personColumn}, type, status,
         subject, body, metadata, created_by_user_id)
       VALUES (${companyValues} $1::uuid, 'whatsapp', 'completed',
               'Respuesta por WhatsApp', $3, $4::jsonb, $5::uuid)`,
      [
        personId,
        incoming.company_id,
        body,
        JSON.stringify({ communicationId: incoming.id, direction: 'outbound' }),
        staffId,
      ],
    );
  }

  async createTemplate(
    companyId: string,
    dto: CreateCommunicationTemplateDto,
  ): Promise<CommunicationTemplate> {
    this.assertWhatsappOnly(dto.channel);
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
    this.assertWhatsappOnly(dto.channel ?? template.channel);
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
    this.assertWhatsappOnly(input.channel);
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

    const delivery = await this.deliveriesRepository.save(
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
        leaseExpiresAt: null,
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

    return delivery;
  }

  async approve(id: string, companyId: string): Promise<CommunicationDelivery> {
    const delivery = await this.findDelivery(id, companyId);
    if (delivery.status !== CommunicationDeliveryStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Delivery is not pending approval');
    }
    delivery.status = CommunicationDeliveryStatus.QUEUED;
    delivery.nextAttemptAt = new Date();
    delivery.leaseExpiresAt = null;
    return this.deliveriesRepository.save(delivery);
  }

  async retry(id: string, companyId: string): Promise<CommunicationDelivery> {
    const delivery = await this.findDelivery(id, companyId);
    if (delivery.status !== CommunicationDeliveryStatus.FAILED) {
      throw new BadRequestException('Only failed deliveries can be retried');
    }
    delivery.status = CommunicationDeliveryStatus.QUEUED;
    delivery.nextAttemptAt = new Date();
    delivery.leaseExpiresAt = null;
    return this.deliveriesRepository.save(delivery);
  }

  async retryDue(): Promise<{
    processed: number;
    sent: number;
    failed: number;
  }> {
    const claimed = await this.dataSource.query(
      `WITH due AS (
         SELECT id
           FROM communication_deliveries
          WHERE attempts < max_attempts
            AND (
              (status IN ('queued', 'failed') AND next_attempt_at <= NOW())
              OR (status = 'processing' AND lease_expires_at < NOW())
            )
          ORDER BY next_attempt_at ASC NULLS FIRST, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 100
       )
       UPDATE communication_deliveries delivery
          SET status = 'processing', attempts = attempts + 1,
              lease_expires_at = NOW() + INTERVAL '5 minutes',
              updated_at = NOW()
         FROM due
        WHERE delivery.id = due.id
       RETURNING delivery.id`,
    );
    let sent = 0;
    let failed = 0;
    for (const claimedDelivery of claimed ?? []) {
      const delivery = await this.deliveriesRepository.findOne({
        where: { id: claimedDelivery.id },
      });
      if (!delivery) continue;
      const result = await this.attemptDelivery(delivery);
      if (result.status === CommunicationDeliveryStatus.SENT) sent += 1;
      else failed += 1;
    }
    return { processed: claimed?.length ?? 0, sent, failed };
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
    try {
      delivery.providerMessageId = await this.send(delivery);
      delivery.status = CommunicationDeliveryStatus.SENT;
      delivery.sentAt = new Date();
      delivery.nextAttemptAt = null;
      delivery.leaseExpiresAt = null;
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
      delivery.leaseExpiresAt = null;
    }
    return this.deliveriesRepository.save(delivery);
  }

  private async send(delivery: CommunicationDelivery): Promise<string | null> {
    this.assertWhatsappOnly(delivery.channel);
    const result = await this.whatsappService.sendTextMessage(
      delivery.recipient,
      delivery.body,
      typeof delivery.metadata?.attachmentUrl === 'string'
        ? delivery.metadata.attachmentUrl
        : undefined,
      {
        companyId: delivery.companyId,
        idempotencyKey: delivery.id,
        relatedEntityType: this.toWhatsappEntityType(
          delivery.relatedEntityType,
        ),
        relatedEntityId: delivery.relatedEntityId ?? undefined,
      },
    );
    return result.messageId;
  }

  private assertWhatsappOnly(channel: CommunicationChannel): void {
    if (channel !== CommunicationChannel.WHATSAPP) {
      throw new BadRequestException(
        'Email and SMS are disabled; communications require explicit WhatsApp opt-in',
      );
    }
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
