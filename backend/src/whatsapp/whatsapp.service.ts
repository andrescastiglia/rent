import {
  BadRequestException,
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { ModuleRef } from '@nestjs/core';
import OpenAI, { toFile } from 'openai';
import { DataSource } from 'typeorm';
import { AI_RAG_ROLLOUT } from '../ai/ai.tokens';
import { UserRole } from '../users/entities/user.entity';

type AiRagRollout = {
  respond(params: {
    prompt: string;
    context: {
      userId: string;
      companyId: string;
      role: UserRole;
      mutationApprovalMode: 'staff_queue';
    };
  }): Promise<{
    conversationId: string;
    outputText: string;
    toolState?: Record<string, unknown>;
  }>;
};

export type WhatsappSendResult = {
  messageId: string | null;
  raw: unknown;
  documentMessageId?: string | null;
};

export type WhatsappActivityEntity = 'tenant' | 'owner' | 'interested';
export type WhatsappRelatedEntityType =
  WhatsappActivityEntity | 'property_visit' | 'invoice' | 'payment' | 'lease';

export type WhatsappMessageContext = {
  companyId?: string;
  idempotencyKey?: string;
  relatedEntityType?: WhatsappRelatedEntityType;
  relatedEntityId?: string;
  activityEntity?: WhatsappActivityEntity;
  activityId?: string;
};

export type WhatsappTemplateOptions = {
  textFallback?: string;
  pdfUrl?: string;
  context?: WhatsappMessageContext;
};

export type WhatsappRecipientRole =
  'admin' | 'staff' | 'buyer' | 'tenant' | 'owner' | 'interested';

export type QueueWhatsappMessageInput = {
  companyId: string;
  recipientRole: WhatsappRecipientRole;
  recipientId: string;
  idempotencyKey: string;
  to: string;
  text: string;
  pdfUrl?: string;
  templateName?: string;
  templateLanguage?: string;
  templateParameters?: string[];
  activityEntity?: WhatsappActivityEntity;
  activityId?: string;
  relatedEntityType?: WhatsappRelatedEntityType;
  relatedEntityId?: string;
};

export type QueueWhatsappMessageResult = {
  deliveryId: string;
  status: string;
  queued: boolean;
};

export type WhatsappRetentionResult = {
  processedInboxDeleted: number;
  deadLettersDeleted: number;
  communicationsRedacted: number;
  outboundMessagesRedacted: number;
};

type WhatsappOutboundLogInput = {
  to: string;
  messageType: 'text' | 'document' | 'template';
  text?: string;
  pdfUrl?: string;
  templateName?: string;
  templateLanguage?: string;
  status: 'sent' | 'failed';
  messageId?: string | null;
  raw?: unknown;
  errorMessage?: string;
  context?: WhatsappMessageContext;
};

@Injectable()
export class WhatsappService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WhatsappService.name);

  private readonly apiBaseUrl =
    process.env.WHATSAPP_API_BASE_URL ?? 'https://graph.facebook.com/v22.0';
  private readonly phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  private readonly accessToken = process.env.WHATSAPP_ACCESS_TOKEN ?? '';
  private readonly verifyToken = process.env.WHATSAPP_VERIFY_TOKEN ?? '';
  private readonly appSecret = process.env.WHATSAPP_APP_SECRET ?? '';
  private readonly batchInternalToken =
    process.env.BATCH_WHATSAPP_INTERNAL_TOKEN ?? '';
  private readonly frontendUrl =
    (process.env.FRONTEND_URL ?? '').split(',')[0]?.trim() ?? '';
  private readonly documentsBaseUrl =
    (process.env.WHATSAPP_DOCUMENTS_BASE_URL ?? this.frontendUrl) ||
    `http://localhost:${process.env.PORT ?? 3001}`;
  private readonly documentLinkSecret =
    process.env.WHATSAPP_DOCUMENT_LINK_SECRET ?? '';
  private readonly documentLinkTtlSeconds = Math.max(
    60,
    Number.parseInt(
      process.env.WHATSAPP_DOCUMENT_LINK_TTL_SECONDS ?? '604800',
      10,
    ) || 604800,
  );
  private readonly enabled =
    process.env.WHATSAPP_ENABLED?.toLowerCase() === 'true';
  private readonly inboundEnabled =
    process.env.WHATSAPP_INBOUND_ENABLED?.toLowerCase() === 'true';
  private readonly inboundDailyLimit = Math.max(
    1,
    Number.parseInt(process.env.WHATSAPP_INBOUND_DAILY_LIMIT ?? '50', 10) || 50,
  );
  private readonly inboxRetentionDays = Math.max(
    1,
    Number.parseInt(process.env.WHATSAPP_INBOX_RETENTION_DAYS ?? '7', 10) || 7,
  );
  private readonly deadLetterRetentionDays = Math.max(
    1,
    Number.parseInt(
      process.env.WHATSAPP_DEAD_LETTER_RETENTION_DAYS ?? '30',
      10,
    ) || 30,
  );
  private readonly communicationRetentionDays = Math.max(
    1,
    Number.parseInt(
      process.env.WHATSAPP_COMMUNICATION_RETENTION_DAYS ?? '365',
      10,
    ) || 365,
  );
  private readonly outboundRetentionDays = Math.max(
    1,
    Number.parseInt(process.env.WHATSAPP_OUTBOUND_RETENTION_DAYS ?? '90', 10) ||
      90,
  );

  constructor(
    @Optional()
    @InjectDataSource()
    private readonly dataSource?: DataSource,
    private readonly moduleRef?: ModuleRef,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureTrackingTable();
  }

  async enqueueMessage(
    input: QueueWhatsappMessageInput,
  ): Promise<QueueWhatsappMessageResult> {
    if (!this.dataSource || this.dataSource.options.type !== 'postgres') {
      throw new ServiceUnavailableException('WhatsApp outbox is unavailable');
    }
    const normalizedPhone = this.normalizePhone(input.to);
    if (!normalizedPhone) {
      throw new BadRequestException('Invalid WhatsApp phone number');
    }
    const body = input.text.trim();
    if (!body) throw new BadRequestException('WhatsApp message is empty');

    await this.assertRecipientConsent(input, normalizedPhone);
    await this.assertActivityScope(input);

    const metadata = {
      ...(input.pdfUrl ? { attachmentUrl: input.pdfUrl } : {}),
      ...(input.templateName ? { templateName: input.templateName } : {}),
      ...(input.templateLanguage
        ? { templateLanguage: input.templateLanguage }
        : {}),
      ...(input.templateParameters
        ? { templateParameters: input.templateParameters }
        : {}),
      ...(input.activityEntity
        ? { activityEntity: input.activityEntity, activityId: input.activityId }
        : {}),
    };
    const rows = await this.dataSource.query(
      `INSERT INTO communication_deliveries (
         company_id, event, recipient_role, recipient_id, channel, recipient,
         body, status, attempts, max_attempts, next_attempt_at,
         related_entity_type, related_entity_id, idempotency_key, metadata
       ) VALUES (
         $1::uuid, 'whatsapp_ad_hoc', $2::communication_recipient_role,
         $3::uuid, 'whatsapp', $4, $5, 'queued', 0, 3, NOW(), $6, $7::uuid,
         $8, $9::jsonb
       )
       ON CONFLICT (company_id, idempotency_key)
         WHERE idempotency_key IS NOT NULL
       DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
       RETURNING id, status`,
      [
        input.companyId,
        input.recipientRole,
        input.recipientId,
        normalizedPhone,
        body,
        input.relatedEntityType ?? null,
        input.relatedEntityId ?? null,
        input.idempotencyKey,
        JSON.stringify(metadata),
      ],
    );
    return {
      deliveryId: rows[0].id,
      status: rows[0].status,
      queued: rows[0].status === 'queued' || rows[0].status === 'processing',
    };
  }

  private async assertRecipientConsent(
    input: QueueWhatsappMessageInput,
    normalizedPhone: string,
  ): Promise<void> {
    let rows: Array<{ phone: string | null; consented: boolean }>;
    if (input.recipientRole === 'tenant' || input.recipientRole === 'owner') {
      const table = input.recipientRole === 'tenant' ? 'tenants' : 'owners';
      rows = await this.dataSource!.query(
        `SELECT u.phone, u.whatsapp_enabled AS consented
           FROM ${table} profile
           JOIN users u ON u.id = profile.user_id AND u.deleted_at IS NULL
          WHERE profile.id = $1::uuid AND profile.company_id = $2::uuid
            AND profile.deleted_at IS NULL`,
        [input.recipientId, input.companyId],
      );
    } else if (input.recipientRole === 'interested') {
      rows = await this.dataSource!.query(
        `SELECT phone, consent_contact AS consented
           FROM interested_profiles
          WHERE id = $1::uuid AND company_id = $2::uuid AND deleted_at IS NULL`,
        [input.recipientId, input.companyId],
      );
    } else {
      rows = await this.dataSource!.query(
        `SELECT phone, whatsapp_enabled AS consented
           FROM users
          WHERE id = $1::uuid AND company_id = $2::uuid AND role = $3::user_role
            AND deleted_at IS NULL`,
        [input.recipientId, input.companyId, input.recipientRole],
      );
    }
    const recipient = rows[0];
    if (!recipient) throw new NotFoundException('WhatsApp recipient not found');
    if (!recipient.consented) {
      throw new BadRequestException(
        'The recipient has not consented to WhatsApp',
      );
    }
    if (this.normalizePhone(recipient.phone ?? '') !== normalizedPhone) {
      throw new BadRequestException(
        'Recipient phone does not match the record',
      );
    }
  }

  private async assertActivityScope(
    input: QueueWhatsappMessageInput,
  ): Promise<void> {
    if (!input.activityEntity && !input.activityId) return;
    if (!input.activityEntity || !input.activityId) {
      throw new BadRequestException(
        'WhatsApp activity entity and id must be provided together',
      );
    }
    if (
      input.activityEntity !== input.recipientRole ||
      (input.relatedEntityType &&
        input.relatedEntityType !== input.recipientRole) ||
      (input.relatedEntityId && input.relatedEntityId !== input.recipientId)
    ) {
      throw new BadRequestException('WhatsApp activity recipient mismatch');
    }
    const rows =
      input.activityEntity === 'interested'
        ? await this.dataSource!.query(
            `SELECT activity.id
               FROM interested_activities activity
               JOIN interested_profiles profile
                 ON profile.id = activity.interested_profile_id
              WHERE activity.id = $1::uuid AND profile.id = $2::uuid
                AND profile.company_id = $3::uuid AND profile.deleted_at IS NULL`,
            [input.activityId, input.recipientId, input.companyId],
          )
        : await this.dataSource!.query(
            `SELECT id FROM ${input.activityEntity}_activities
              WHERE id = $1::uuid AND ${input.activityEntity}_id = $2::uuid
                AND company_id = $3::uuid`,
            [input.activityId, input.recipientId, input.companyId],
          );
    if (!rows[0]) throw new NotFoundException('WhatsApp activity not found');
  }

  private withIdempotencyComponent(
    context: WhatsappMessageContext | undefined,
    component: string,
  ): WhatsappMessageContext | undefined {
    if (!context?.idempotencyKey) return context;
    const hex = createHash('sha256')
      .update(`${context.idempotencyKey}:${component}`)
      .digest('hex')
      .slice(0, 32)
      .split('');
    hex[12] = '5';
    hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
    const uuid = `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
    return { ...context, idempotencyKey: uuid };
  }

  async sendTextMessage(
    to: string,
    text: string,
    pdfUrl?: string,
    context?: WhatsappMessageContext,
  ): Promise<WhatsappSendResult> {
    if (!this.enabled) {
      throw new ServiceUnavailableException('WhatsApp messaging is disabled');
    }

    if (!this.phoneNumberId || !this.accessToken) {
      throw new ServiceUnavailableException(
        'WhatsApp configuration is incomplete',
      );
    }

    const normalizedPhone = this.normalizePhone(to);
    if (!normalizedPhone) {
      throw new BadGatewayException('Invalid WhatsApp phone number');
    }

    const messageBody = text.trim();
    if (!messageBody) {
      throw new BadGatewayException('WhatsApp message body cannot be empty');
    }

    let payload: Record<string, unknown>;
    if (pdfUrl) {
      const documentId = this.extractDocumentIdFromDbUrl(pdfUrl);
      const publicPdfUrl = this.buildDocumentAccessUrl(pdfUrl);
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedPhone,
        type: 'document',
        document: {
          link: publicPdfUrl,
          filename: `document-${documentId ?? 'file'}.pdf`,
          caption: messageBody.slice(0, 1024),
        },
      };
    } else {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedPhone,
        type: 'text',
        text: { body: messageBody.slice(0, 4096) },
      };
    }

    return this.postOutboundPayload(payload, {
      to: normalizedPhone,
      messageType: pdfUrl ? 'document' : 'text',
      text: messageBody,
      pdfUrl,
      context,
    });
  }

  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    bodyParameters: string[],
    options: WhatsappTemplateOptions = {},
  ): Promise<WhatsappSendResult> {
    if (!this.enabled) {
      throw new ServiceUnavailableException('WhatsApp messaging is disabled');
    }

    if (!this.phoneNumberId || !this.accessToken) {
      throw new ServiceUnavailableException(
        'WhatsApp configuration is incomplete',
      );
    }

    const normalizedPhone = this.normalizePhone(to);
    if (!normalizedPhone) {
      throw new BadGatewayException('Invalid WhatsApp phone number');
    }

    const normalizedTemplateName = templateName.trim();
    if (!/^[a-z0-9_]{1,120}$/.test(normalizedTemplateName)) {
      throw new BadGatewayException('Invalid WhatsApp template name');
    }

    const normalizedLanguage = this.resolveLanguageCode(languageCode);
    const parameters = bodyParameters.map((value) => ({
      type: 'text',
      text: String(value ?? '').slice(0, 1024),
    }));

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'template',
      template: {
        name: normalizedTemplateName,
        language: { code: normalizedLanguage },
        ...(parameters.length > 0
          ? { components: [{ type: 'body', parameters }] }
          : {}),
      },
    };

    const templateContext = options.pdfUrl
      ? this.withIdempotencyComponent(options.context, 'template')
      : options.context;
    const templateResult = await this.postOutboundPayload(payload, {
      to: normalizedPhone,
      messageType: 'template',
      text: options.textFallback,
      templateName: normalizedTemplateName,
      templateLanguage: normalizedLanguage,
      context: templateContext,
    });

    if (!options.pdfUrl) {
      return templateResult;
    }

    const documentResult = await this.sendTextMessage(
      normalizedPhone,
      options.textFallback ?? 'Documento disponible.',
      options.pdfUrl,
      this.withIdempotencyComponent(options.context, 'document'),
    );

    return {
      ...templateResult,
      documentMessageId: documentResult.messageId,
    };
  }

  verifyWebhookToken(token?: string): boolean {
    return !!this.verifyToken && token === this.verifyToken;
  }

  verifyWebhookSignature(signature?: string, rawBody?: Buffer): boolean {
    if (!signature || !rawBody || !this.appSecret) return false;
    const expected = `sha256=${createHmac('sha256', this.appSecret)
      .update(rawBody)
      .digest('hex')}`;
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  logIncomingError(error: unknown): void {
    this.logger.error('Failed to process incoming WhatsApp message', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
  }

  async acceptIncomingWebhook(payload: unknown): Promise<{ received: true }> {
    if (!this.dataSource || this.dataSource.options.type !== 'postgres') {
      throw new ServiceUnavailableException(
        'WhatsApp webhook inbox is unavailable',
      );
    }
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid WhatsApp webhook payload');
    }

    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, 'utf8') > 256 * 1024) {
      throw new BadRequestException('WhatsApp webhook payload is too large');
    }
    const eventKey = createHash('sha256').update(serialized).digest('hex');
    const inserted = await this.dataSource.query(
      `INSERT INTO whatsapp_webhook_inbox (
         event_key, payload, status, attempts, available_at
       ) VALUES ($1, $2::jsonb, 'queued', 0, NOW())
       ON CONFLICT (event_key) DO NOTHING
       RETURNING id`,
      [eventKey, serialized],
    );

    const inboxId = inserted?.[0]?.id as string | undefined;
    if (inboxId && this.inboundEnabled) {
      void this.processWebhookInboxItem(inboxId).catch((error) =>
        this.logIncomingError(error),
      );
    }
    return { received: true };
  }

  async processDueWebhookInbox(
    requestedLimit = 25,
  ): Promise<{ selected: number; processed: number; failed: number }> {
    if (!this.inboundEnabled) {
      return { selected: 0, processed: 0, failed: 0 };
    }
    if (!this.dataSource || this.dataSource.options.type !== 'postgres') {
      throw new ServiceUnavailableException(
        'WhatsApp webhook inbox is unavailable',
      );
    }
    const limit = Math.max(1, Math.min(100, Math.floor(requestedLimit) || 25));
    const due = await this.dataSource.query(
      `SELECT id
         FROM whatsapp_webhook_inbox
        WHERE attempts < 5
          AND (
            (status IN ('queued', 'failed') AND available_at <= NOW())
            OR (status = 'processing' AND lease_expires_at < NOW())
          )
        ORDER BY available_at ASC, received_at ASC
        LIMIT $1`,
      [limit],
    );

    let processed = 0;
    let failed = 0;
    for (const row of due) {
      const result = await this.processWebhookInboxItem(String(row.id));
      if (result === 'processed') processed += 1;
      if (result === 'failed') failed += 1;
    }
    return { selected: due.length, processed, failed };
  }

  async applyRetentionPolicy(): Promise<WhatsappRetentionResult> {
    if (!this.dataSource || this.dataSource.options.type !== 'postgres') {
      throw new ServiceUnavailableException(
        'WhatsApp retention storage is unavailable',
      );
    }

    const rows = await this.dataSource.query(
      `WITH processed_inbox AS (
         DELETE FROM whatsapp_webhook_inbox
          WHERE status = 'processed'
            AND processed_at < NOW() - ($1::int * INTERVAL '1 day')
         RETURNING 1
       ), dead_letters AS (
         DELETE FROM whatsapp_webhook_inbox
          WHERE status = 'dead_letter'
            AND updated_at < NOW() - ($2::int * INTERVAL '1 day')
         RETURNING 1
       ), communications AS (
         UPDATE person_communications
            SET body = '[redacted]',
                metadata = (
                  COALESCE(metadata, '{}'::jsonb)
                  - 'processingError'
                  - 'processingErrorType'
                ) || '{"retentionRedacted":true}'::jsonb,
                updated_at = NOW()
          WHERE created_at < NOW() - ($3::int * INTERVAL '1 day')
            AND body <> '[redacted]'
            AND (
              whatsapp_message_id IS NOT NULL
              OR metadata->>'provider' = 'meta'
            )
         RETURNING 1
       ), outbound_messages AS (
         UPDATE whatsapp_messages
            SET recipient_phone = '[redacted]', text = NULL, pdf_url = NULL,
                error_message = NULL, raw_response = '{}'::jsonb,
                raw_status = '{}'::jsonb, updated_at = NOW()
          WHERE created_at < NOW() - ($4::int * INTERVAL '1 day')
            AND recipient_phone <> '[redacted]'
         RETURNING 1
       )
       SELECT
         (SELECT COUNT(*)::int FROM processed_inbox) AS processed_inbox_deleted,
         (SELECT COUNT(*)::int FROM dead_letters) AS dead_letters_deleted,
         (SELECT COUNT(*)::int FROM communications) AS communications_redacted,
         (SELECT COUNT(*)::int FROM outbound_messages) AS outbound_messages_redacted`,
      [
        this.inboxRetentionDays,
        this.deadLetterRetentionDays,
        this.communicationRetentionDays,
        this.outboundRetentionDays,
      ],
    );
    const result = rows?.[0] ?? {};
    return {
      processedInboxDeleted: Number(result.processed_inbox_deleted ?? 0),
      deadLettersDeleted: Number(result.dead_letters_deleted ?? 0),
      communicationsRedacted: Number(result.communications_redacted ?? 0),
      outboundMessagesRedacted: Number(result.outbound_messages_redacted ?? 0),
    };
  }

  private async processWebhookInboxItem(
    inboxId: string,
  ): Promise<'processed' | 'failed' | 'skipped'> {
    if (!this.dataSource) return 'skipped';
    const claimed = await this.dataSource.query(
      `UPDATE whatsapp_webhook_inbox
          SET status = 'processing', attempts = attempts + 1,
              lease_expires_at = NOW() + INTERVAL '5 minutes',
              updated_at = NOW()
        WHERE id = $1::uuid
          AND attempts < 5
          AND (
            (status IN ('queued', 'failed') AND available_at <= NOW())
            OR (status = 'processing' AND lease_expires_at < NOW())
          )
      RETURNING payload, attempts`,
      [inboxId],
    );
    if (!claimed?.[0]) return 'skipped';

    try {
      await this.handleIncomingWebhook(claimed[0].payload);
      await this.dataSource.query(
        `UPDATE whatsapp_webhook_inbox
            SET status = 'processed', processed_at = NOW(),
                lease_expires_at = NULL, last_error = NULL, updated_at = NOW()
          WHERE id = $1::uuid`,
        [inboxId],
      );
      return 'processed';
    } catch (error) {
      const attempts = Number(claimed[0].attempts);
      const isDeadLetter = attempts >= 5;
      const backoffSeconds = Math.min(
        3600,
        30 * 2 ** Math.max(0, attempts - 1),
      );
      await this.dataSource.query(
        `UPDATE whatsapp_webhook_inbox
            SET status = $2,
                available_at = CASE
                  WHEN $2 = 'dead_letter' THEN available_at
                  ELSE NOW() + ($3 * INTERVAL '1 second')
                END,
                lease_expires_at = NULL, last_error = $4, updated_at = NOW()
          WHERE id = $1::uuid`,
        [
          inboxId,
          isDeadLetter ? 'dead_letter' : 'failed',
          backoffSeconds,
          error instanceof Error ? error.name : 'UnknownError',
        ],
      );
      this.logIncomingError(error);
      return 'failed';
    }
  }

  isDocumentTokenValid(documentId: string, token?: string): boolean {
    if (!token || !this.documentLinkSecret) {
      return false;
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return false;
    }

    const [expRaw, signature] = parts;
    const exp = Number.parseInt(expRaw, 10);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      return false;
    }

    const expectedSignature = this.signDocumentToken(documentId, exp);
    try {
      return timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      );
    } catch {
      return false;
    }
  }

  assertBatchToken(headerToken?: string): void {
    if (!this.batchInternalToken) {
      throw new ServiceUnavailableException(
        'Batch WhatsApp internal token is not configured',
      );
    }

    if (!headerToken || headerToken !== this.batchInternalToken) {
      throw new UnauthorizedException('Invalid batch WhatsApp token');
    }
  }

  async handleIncomingWebhook(payload: unknown): Promise<void> {
    let sawMessage = false;
    let sawStatus = false;

    for (const entry of this.getWebhookEntries(payload)) {
      for (const item of this.asArray(entry?.changes)) {
        const value = item?.value;
        sawStatus =
          (await this.handleWebhookStatuses(value?.statuses)) || sawStatus;
        sawMessage =
          (await this.handleWebhookMessages(value?.messages)) || sawMessage;
      }
    }

    if (!sawMessage && !sawStatus) {
      this.logger.debug('WhatsApp webhook received without messages');
    }
  }

  private getWebhookEntries(payload: unknown): any[] {
    return this.asArray((payload as any)?.entry);
  }

  private asArray(value: unknown): any[] {
    return Array.isArray(value) ? value : [];
  }

  private async handleWebhookStatuses(statuses: unknown): Promise<boolean> {
    const items = this.asArray(statuses);

    for (const status of items) {
      await this.updateMessageStatus(status);
    }

    return items.length > 0;
  }

  private async handleWebhookMessages(messages: unknown): Promise<boolean> {
    const items = this.asArray(messages);

    for (const item of items) {
      await this.processIncomingMessage(item as Record<string, any>);
    }

    return items.length > 0;
  }

  private async processIncomingMessage(
    message: Record<string, any>,
  ): Promise<void> {
    const senderHash = this.hashLogSubject(String(message.from ?? 'unknown'));
    this.logger.log('WhatsApp webhook message received', {
      senderHash,
      messageId: String(message.id ?? '') || undefined,
      messageType: String(message.type ?? 'unknown'),
    });
    if (!this.dataSource || this.dataSource.options.type !== 'postgres') return;
    const whatsappMessageId = String(message.id ?? '').trim();
    const from = this.normalizePhone(String(message.from ?? ''));
    if (!whatsappMessageId || !from) return;

    const users = await this.dataSource.query(
      `SELECT id, company_id, role, language, phone
         FROM users
        WHERE is_active = true AND deleted_at IS NULL
          AND whatsapp_enabled = true
          AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = $1
        LIMIT 2`,
      [from],
    );
    if (users.length !== 1) {
      this.logger.warn('Ignored unconsented or ambiguous WhatsApp sender', {
        senderHash,
      });
      return;
    }
    const user = users[0] as {
      id: string;
      company_id: string;
      role: UserRole;
      language: string;
    };
    const text = String(message.text?.body ?? '')
      .trim()
      .slice(0, 10000);
    const hasVoice = Boolean(String(message.audio?.id ?? '').trim());
    if (!text && !hasVoice) return;
    let content: { body: string; type: 'text' | 'voice' } = text
      ? { body: text, type: 'text' }
      : { body: '[pending-transcription]', type: 'voice' };
    const personId = await this.resolvePersonId(user.id, user.role);
    const isStaff = [UserRole.ADMIN, UserRole.STAFF].includes(user.role);
    const budgetKey = createHash('sha256')
      .update(`whatsapp-inbound:${user.company_id}:${user.id}`)
      .digest('hex');
    const inserted = await this.dataSource.query(
      `WITH inserted AS (
         INSERT INTO person_communications (
           company_id, user_id, person_type, person_id, direction, message_type,
           body, whatsapp_message_id, status, metadata
         ) VALUES ($1::uuid, $2::uuid, $3, $4::uuid, 'inbound', $5, $6, $7,
                   $8, $9::jsonb)
         ON CONFLICT (whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL
         DO NOTHING RETURNING id
       ), budget AS (
         INSERT INTO api_rate_limit_buckets (
           bucket_key, window_started_at, request_count, expires_at
         )
         SELECT $10, NOW(), 1, NOW() + INTERVAL '24 hours' FROM inserted
         ON CONFLICT (bucket_key) DO UPDATE
         SET request_count = CASE
               WHEN api_rate_limit_buckets.expires_at <= NOW() THEN 1
               ELSE api_rate_limit_buckets.request_count + 1
             END,
             window_started_at = CASE
               WHEN api_rate_limit_buckets.expires_at <= NOW() THEN NOW()
               ELSE api_rate_limit_buckets.window_started_at
             END,
             expires_at = CASE
               WHEN api_rate_limit_buckets.expires_at <= NOW()
                 THEN NOW() + INTERVAL '24 hours'
               ELSE api_rate_limit_buckets.expires_at
             END
         RETURNING request_count
       )
       SELECT inserted.id, budget.request_count
         FROM inserted CROSS JOIN budget`,
      [
        user.company_id,
        user.id,
        user.role,
        personId,
        content.type,
        content.body,
        whatsappMessageId,
        isStaff ? 'read' : 'new',
        JSON.stringify({
          provider: 'meta',
          originalType: message.type,
        }),
        budgetKey,
      ],
    );
    if (!inserted?.[0]) return;
    const budgetExceeded =
      Number(inserted[0].request_count ?? 1) > this.inboundDailyLimit;
    if (budgetExceeded) {
      await this.dataSource.query(
        `UPDATE person_communications
            SET body = '[rate-limited]',
                metadata = metadata || '{"abuseLimited":true}'::jsonb,
                updated_at = NOW()
          WHERE id = $1::uuid`,
        [inserted[0].id],
      );
      this.logger.warn('WhatsApp inbound abuse budget reached', {
        senderHash,
      });
      return;
    }

    try {
      if (content.type === 'voice') {
        content = await this.extractIncomingContent(message);
        if (!content.body) return;
        await this.dataSource.query(
          `UPDATE person_communications
              SET body = $2, updated_at = NOW()
            WHERE id = $1::uuid`,
          [inserted[0].id, content.body],
        );
      }
      const rollout = this.moduleRef?.get<AiRagRollout>(AI_RAG_ROLLOUT, {
        strict: false,
      });
      if (!rollout)
        throw new ServiceUnavailableException('AI service is unavailable');
      const response = await rollout.respond({
        prompt: content.body,
        context: {
          userId: user.id,
          companyId: user.company_id,
          role: user.role,
          mutationApprovalMode: 'staff_queue',
        },
      });
      const answer =
        response.outputText?.trim() ||
        'Recibimos tu mensaje. Si requiere una acción, quedó pendiente de revisión.';
      await this.queueAssistantResponse(
        {
          id: inserted[0].id,
          companyId: user.company_id,
          userId: user.id,
          personId,
          role: user.role,
          phone: from,
          body: answer,
        },
        {
          conversationId: response.conversationId,
          responseQueued: true,
        },
      );
    } catch (error) {
      await this.queueAssistantResponse(
        {
          id: inserted[0].id,
          companyId: user.company_id,
          userId: user.id,
          personId,
          role: user.role,
          phone: from,
          body: 'Recibimos tu mensaje y quedó pendiente de revisión por el equipo.',
        },
        {
          processingErrorType:
            error instanceof Error ? error.name : 'UnknownError',
          responseQueued: true,
        },
      );
    }
  }

  private async queueAssistantResponse(
    message: {
      id: string;
      companyId: string;
      userId: string;
      personId: string;
      role: UserRole;
      phone: string;
      body: string;
    },
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!this.dataSource) {
      throw new ServiceUnavailableException('WhatsApp outbox is unavailable');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO communication_deliveries (
           company_id, event, recipient_role, recipient_id, channel, recipient,
           body, status, attempts, max_attempts, next_attempt_at, metadata,
           source_communication_id
         ) VALUES ($1::uuid, 'whatsapp_assistant_response', $2, $3::uuid,
                   'whatsapp', $4, $5, 'queued', 0, 3, NOW(), $6::jsonb,
                   $7::uuid)
         ON CONFLICT (source_communication_id)
           WHERE source_communication_id IS NOT NULL DO NOTHING`,
        [
          message.companyId,
          message.role,
          message.personId,
          message.phone,
          message.body,
          JSON.stringify({
            ...metadata,
            source: 'whatsapp-inbound',
            userId: message.userId,
          }),
          message.id,
        ],
      );
      await manager.query(
        `UPDATE person_communications
            SET metadata = metadata || $2::jsonb, updated_at = NOW()
          WHERE id = $1::uuid`,
        [message.id, JSON.stringify(metadata)],
      );
    });
  }

  private async extractIncomingContent(
    message: Record<string, any>,
  ): Promise<{ body: string; type: 'text' | 'voice' }> {
    const text = String(message.text?.body ?? '').trim();
    if (text) return { body: text.slice(0, 10000), type: 'text' };
    const mediaId = String(message.audio?.id ?? '').trim();
    if (!mediaId) return { body: '', type: 'text' };
    const metadataResponse = await fetch(
      `${this.apiBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(mediaId)}`,
      { headers: { Authorization: `Bearer ${this.accessToken}` } },
    );
    const metadata = (await metadataResponse.json().catch(() => null)) as {
      url?: string;
      mime_type?: string;
    } | null;
    if (!metadataResponse.ok || !metadata?.url) {
      throw new BadGatewayException(
        'Could not retrieve WhatsApp voice metadata',
      );
    }
    const mediaResponse = await fetch(metadata.url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!mediaResponse.ok)
      throw new BadGatewayException('Could not download WhatsApp voice');
    const buffer = Buffer.from(await mediaResponse.arrayBuffer());
    const maxBytes = Number(process.env.WHATSAPP_MAX_VOICE_BYTES ?? 16_000_000);
    if (buffer.length > maxBytes)
      throw new BadGatewayException('WhatsApp voice is too large');
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    const client = new OpenAI({
      apiKey,
      ...(process.env.OPENAI_BASE_URL
        ? { baseURL: process.env.OPENAI_BASE_URL }
        : {}),
    });
    const transcription = await client.audio.transcriptions.create({
      file: await toFile(buffer, 'voice.ogg', {
        type: metadata.mime_type ?? 'audio/ogg',
      }),
      model: process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe',
    });
    return { body: transcription.text.trim().slice(0, 10000), type: 'voice' };
  }

  private async resolvePersonId(
    userId: string,
    role: UserRole,
  ): Promise<string> {
    if (!this.dataSource) return userId;
    const table =
      role === UserRole.OWNER
        ? 'owners'
        : role === UserRole.TENANT
          ? 'tenants'
          : role === UserRole.BUYER
            ? 'buyers'
            : null;
    if (!table) return userId;
    const rows = await this.dataSource.query(
      `SELECT id FROM ${table} WHERE user_id = $1::uuid AND deleted_at IS NULL LIMIT 1`,
      [userId],
    );
    return rows[0]?.id ?? userId;
  }

  resolveLanguageCode(locale?: string): string {
    const normalized = (locale || 'es_AR').replace('-', '_');
    const aliases: Record<string, string> = {
      es: 'es_AR',
      es_AR: 'es_AR',
      en: 'en_US',
      en_US: 'en_US',
      pt: 'pt_BR',
      pt_BR: 'pt_BR',
    };

    return aliases[normalized] ?? 'es_AR';
  }

  private buildDocumentAccessUrl(pdfUrl: string): string {
    const documentId = this.extractDocumentIdFromDbUrl(pdfUrl);
    if (!documentId) {
      throw new BadGatewayException('Invalid db PDF URL for WhatsApp message');
    }

    if (!this.documentLinkSecret) {
      throw new ServiceUnavailableException(
        'WHATSAPP_DOCUMENT_LINK_SECRET is not configured',
      );
    }

    const expiresAt =
      Math.floor(Date.now() / 1000) + this.documentLinkTtlSeconds;
    const signature = this.signDocumentToken(documentId, expiresAt);
    const token = `${expiresAt}.${signature}`;
    const baseUrl = this.documentsBaseUrl.replace(/\/$/, '');

    return `${baseUrl}/whatsapp/documents/${documentId}?token=${token}`;
  }

  private extractDocumentIdFromDbUrl(pdfUrl: string): string | null {
    const match = /^db:\/\/document\/([0-9a-fA-F-]+)$/.exec(pdfUrl.trim());
    return match?.[1] ?? null;
  }

  private signDocumentToken(documentId: string, expiresAt: number): string {
    return createHmac('sha256', this.documentLinkSecret)
      .update(`${documentId}:${expiresAt}`)
      .digest('hex');
  }

  private async postOutboundPayload(
    payload: Record<string, unknown>,
    logInput: Omit<WhatsappOutboundLogInput, 'status' | 'raw' | 'errorMessage'>,
  ): Promise<WhatsappSendResult> {
    const idempotencyKey = logInput.context?.idempotencyKey;
    if (idempotencyKey && this.dataSource?.options.type === 'postgres') {
      const existing = await this.dataSource.query(
        `SELECT whatsapp_message_id
           FROM whatsapp_messages
          WHERE idempotency_key = $1::uuid AND status = 'sent'
          LIMIT 1`,
        [idempotencyKey],
      );
      if (existing?.[0]) {
        return {
          messageId: existing[0].whatsapp_message_id ?? null,
          raw: { deduplicated: true },
        };
      }
      await this.dataSource.query(
        `DELETE FROM whatsapp_messages
          WHERE idempotency_key = $1::uuid AND status <> 'sent'`,
        [idempotencyKey],
      );
    }
    const url = `${this.apiBaseUrl.replace(/\/$/, '')}/${this.phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data: any = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        data?.error?.message ??
        `WhatsApp API request failed (${response.status})`;
      this.logger.error('Failed to send WhatsApp message', {
        status: response.status,
        recipientHash: this.hashLogSubject(logInput.to),
      });
      await this.recordOutboundMessage({
        ...logInput,
        status: 'failed',
        raw: data,
        errorMessage,
      });
      throw new BadGatewayException(errorMessage);
    }

    const messageId = (data?.messages?.[0]?.id as string | undefined) ?? null;
    this.logger.log('WhatsApp message sent', {
      recipientHash: this.hashLogSubject(logInput.to),
      messageId,
    });
    await this.recordOutboundMessage({
      ...logInput,
      status: 'sent',
      messageId,
      raw: data,
    });

    return {
      messageId,
      raw: data,
    };
  }

  private async ensureTrackingTable(): Promise<void> {
    if (this.dataSource?.options.type !== 'postgres') {
      return;
    }

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id uuid PRIMARY KEY,
        idempotency_key uuid,
        whatsapp_message_id varchar(255) UNIQUE,
        recipient_phone varchar(32) NOT NULL,
        direction varchar(16) NOT NULL DEFAULT 'outbound',
        message_type varchar(32) NOT NULL,
        template_name varchar(120),
        template_language varchar(16),
        text text,
        pdf_url varchar(200),
        status varchar(32) NOT NULL DEFAULT 'sent',
        sent_at timestamptz,
        delivered_at timestamptz,
        read_at timestamptz,
        failed_at timestamptz,
        error_message text,
        company_id uuid,
        related_entity_type varchar(64),
        related_entity_id uuid,
        activity_entity varchar(32),
        activity_id uuid,
        raw_response jsonb NOT NULL DEFAULT '{}'::jsonb,
        raw_status jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_activity
      ON whatsapp_messages (activity_entity, activity_id)
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_related
      ON whatsapp_messages (related_entity_type, related_entity_id)
    `);
  }

  private async recordOutboundMessage(
    input: WhatsappOutboundLogInput,
  ): Promise<void> {
    if (this.dataSource?.options.type !== 'postgres') {
      return;
    }

    const sentAt = input.status === 'sent' ? new Date() : null;
    const failedAt = input.status === 'failed' ? new Date() : null;
    try {
      await this.dataSource.query(
        `
          INSERT INTO whatsapp_messages (
            id,
            idempotency_key,
            whatsapp_message_id,
            recipient_phone,
            message_type,
            template_name,
            template_language,
            text,
            pdf_url,
            status,
            sent_at,
            failed_at,
            error_message,
            company_id,
            related_entity_type,
            related_entity_id,
            activity_entity,
            activity_id,
            raw_response,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, now()
          )
          ON CONFLICT (whatsapp_message_id)
          DO UPDATE SET
            status = EXCLUDED.status,
            sent_at = COALESCE(whatsapp_messages.sent_at, EXCLUDED.sent_at),
            failed_at = COALESCE(whatsapp_messages.failed_at, EXCLUDED.failed_at),
            error_message = EXCLUDED.error_message,
            raw_response = EXCLUDED.raw_response,
            updated_at = now()
        `,
        [
          randomUUID(),
          input.context?.idempotencyKey ?? null,
          input.messageId ?? null,
          input.to,
          input.messageType,
          input.templateName ?? null,
          input.templateLanguage ?? null,
          input.text ?? null,
          input.pdfUrl ?? null,
          input.status,
          sentAt,
          failedAt,
          input.errorMessage ?? null,
          input.context?.companyId ?? null,
          input.context?.relatedEntityType ?? null,
          input.context?.relatedEntityId ?? null,
          input.context?.activityEntity ?? null,
          input.context?.activityId ?? null,
          JSON.stringify(input.raw ?? {}),
        ],
      );

      if (input.context?.activityEntity && input.context.activityId) {
        await this.updateActivityMetadata(
          input.context.activityEntity,
          input.context.activityId,
          {
            messageId: input.messageId ?? null,
            status: input.status,
            sentAt: sentAt?.toISOString() ?? null,
            failedAt: failedAt?.toISOString() ?? null,
            templateName: input.templateName ?? null,
            templateLanguage: input.templateLanguage ?? null,
          },
        );
      }
    } catch (error) {
      this.logger.warn('Failed to record WhatsApp message tracking data', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async updateMessageStatus(statusPayload: any): Promise<void> {
    if (this.dataSource?.options.type !== 'postgres') {
      return;
    }

    const messageId = statusPayload?.id;
    const status = statusPayload?.status;
    if (
      !messageId ||
      !['sent', 'delivered', 'read', 'failed'].includes(status)
    ) {
      return;
    }

    const occurredAt = statusPayload?.timestamp
      ? new Date(Number(statusPayload.timestamp) * 1000)
      : new Date();
    const errorMessage = Array.isArray(statusPayload?.errors)
      ? statusPayload.errors
          .map((item: any) => item?.message)
          .filter(Boolean)
          .join('; ') || null
      : null;

    const sentAt = status === 'sent' ? occurredAt : null;
    const deliveredAt = status === 'delivered' ? occurredAt : null;
    const readAt = status === 'read' ? occurredAt : null;
    const failedAt = status === 'failed' ? occurredAt : null;

    const rows = await this.dataSource.query(
      `
        UPDATE whatsapp_messages
        SET
          status = $2,
          sent_at = COALESCE(sent_at, $3),
          delivered_at = COALESCE(delivered_at, $4),
          read_at = COALESCE(read_at, $5),
          failed_at = COALESCE(failed_at, $6),
          error_message = COALESCE($7, error_message),
          raw_status = $8::jsonb,
          updated_at = now()
        WHERE whatsapp_message_id = $1
        RETURNING activity_entity, activity_id
      `,
      [
        messageId,
        status,
        sentAt,
        deliveredAt,
        readAt,
        failedAt,
        errorMessage,
        JSON.stringify(statusPayload ?? {}),
      ],
    );

    const row = rows?.[0];
    if (row?.activity_entity && row?.activity_id) {
      await this.updateActivityMetadata(row.activity_entity, row.activity_id, {
        messageId,
        status,
        sentAt: sentAt?.toISOString() ?? undefined,
        deliveredAt: deliveredAt?.toISOString() ?? undefined,
        readAt: readAt?.toISOString() ?? undefined,
        failedAt: failedAt?.toISOString() ?? undefined,
        errorMessage: errorMessage ?? undefined,
      });
    }
  }

  private async updateActivityMetadata(
    entity: WhatsappActivityEntity,
    activityId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    if (this.dataSource?.options.type !== 'postgres') {
      return;
    }

    const tableByEntity: Record<WhatsappActivityEntity, string> = {
      tenant: 'tenant_activities',
      owner: 'owner_activities',
      interested: 'interested_activities',
    };
    const table = tableByEntity[entity];
    const cleanPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );

    await this.dataSource.query(
      `
        UPDATE ${table}
        SET
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{whatsapp}',
            COALESCE(metadata->'whatsapp', '{}'::jsonb) || $2::jsonb,
            true
          ),
          updated_at = now()
        WHERE id = $1
      `,
      [activityId, JSON.stringify(cleanPatch)],
    );
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replaceAll(/\D+/g, '');
    if (digits.length < 8 || digits.length > 16) {
      return '';
    }
    return digits;
  }

  private hashLogSubject(value: string): string {
    return createHmac('sha256', this.appSecret || 'whatsapp-log-redaction')
      .update(value)
      .digest('hex')
      .slice(0, 16);
  }
}
