import {
  BadGatewayException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { DataSource } from 'typeorm';

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
    (process.env.WHATSAPP_ENABLED ?? 'true').toLowerCase() !== 'false';

  constructor(
    @Optional()
    @InjectDataSource()
    private readonly dataSource?: DataSource,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureTrackingTable();
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

    const templateResult = await this.postOutboundPayload(payload, {
      to: normalizedPhone,
      messageType: 'template',
      text: options.textFallback,
      templateName: normalizedTemplateName,
      templateLanguage: normalizedLanguage,
      context: options.context,
    });

    if (!options.pdfUrl) {
      return templateResult;
    }

    const documentResult = await this.sendTextMessage(
      normalizedPhone,
      options.textFallback ?? 'Documento disponible.',
      options.pdfUrl,
      options.context,
    );

    return {
      ...templateResult,
      documentMessageId: documentResult.messageId,
    };
  }

  verifyWebhookToken(token?: string): boolean {
    return !!this.verifyToken && token === this.verifyToken;
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
        sawMessage = this.logWebhookMessages(value?.messages) || sawMessage;
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

  private logWebhookMessages(messages: unknown): boolean {
    const items = this.asArray(messages);

    for (const item of items) {
      const message = item as any;
      const from = message?.from ?? 'unknown';
      const text = message?.text?.body ?? '[non-text-message]';
      this.logger.log(`WhatsApp webhook message from ${from}: ${text}`);
    }

    return items.length > 0;
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
        errorMessage,
        to: logInput.to,
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
      to: logInput.to,
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
            $11, $12, $13, $14, $15, $16, $17, $18::jsonb, now()
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
}
