import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type WhatsappSendResult = {
  messageId: string | null;
  raw: unknown;
};

@Injectable()
export class WhatsappService {
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

  async sendTextMessage(
    to: string,
    text: string,
    pdfUrl?: string,
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

    const url = `${this.apiBaseUrl.replace(/\/$/, '')}/${this.phoneNumberId}/messages`;
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

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const errorMessage =
        data?.error?.message ??
        `WhatsApp API request failed (${response.status})`;
      this.logger.error('Failed to send WhatsApp message', {
        status: response.status,
        errorMessage,
        to: normalizedPhone,
      });
      throw new BadGatewayException(errorMessage);
    }

    const messageId = (data?.messages?.[0]?.id as string | undefined) ?? null;
    this.logger.log('WhatsApp message sent', {
      to: normalizedPhone,
      messageId,
    });

    return {
      messageId,
      raw: data,
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

  handleIncomingWebhook(payload: unknown): void {
    const change = (payload as any)?.entry?.[0]?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    if (!message) {
      this.logger.debug('WhatsApp webhook received without messages');
      return;
    }

    const from = message.from ?? 'unknown';
    const text = message.text?.body ?? '[non-text-message]';
    this.logger.log(`WhatsApp webhook message from ${from}: ${text}`);
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

  private normalizePhone(phone: string): string {
    const digits = phone.replaceAll(/\D+/g, '');
    if (digits.length < 8 || digits.length > 16) {
      return '';
    }
    return digits;
  }
}
