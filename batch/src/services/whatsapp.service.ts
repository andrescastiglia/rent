import { createHmac } from "node:crypto";
import { logger } from "../shared/logger";

export interface WhatsappSendResult {
  success: boolean;
  deliveryId?: string;
  status?: string;
  messageId?: string | null;
  documentMessageId?: string | null;
  error?: string;
}

export interface WhatsappTemplatePayload {
  templateName: string;
  templateLanguage?: string;
  templateParameters?: string[];
}

export interface WhatsappQueueContext {
  companyId: string;
  recipientRole:
    "admin" | "staff" | "buyer" | "tenant" | "owner" | "interested";
  recipientId: string;
  idempotencyKey: string;
  relatedEntityType?:
    | "tenant"
    | "owner"
    | "interested"
    | "property_visit"
    | "invoice"
    | "payment"
    | "lease";
  relatedEntityId?: string;
}

export interface WhatsappInboxProcessResult {
  selected: number;
  processed: number;
  failed: number;
}

export interface WhatsappRetentionResult {
  processedInboxDeleted: number;
  deadLettersDeleted: number;
  communicationsRedacted: number;
  outboundMessagesRedacted: number;
}

export class WhatsappService {
  private readonly backendUrl =
    process.env.BACKEND_INTERNAL_URL ??
    `http://localhost:${process.env.PORT ?? "3001"}`;
  private readonly internalToken =
    process.env.BATCH_WHATSAPP_INTERNAL_TOKEN ?? "";

  async sendTextMessage(
    to: string,
    text: string,
    pdfUrl?: string,
    context?: WhatsappQueueContext,
  ): Promise<WhatsappSendResult> {
    return this.sendMessage({ to, text, pdfUrl, ...context });
  }

  async sendTemplateMessage(
    to: string,
    template: WhatsappTemplatePayload,
    text: string,
    pdfUrl?: string,
    context?: WhatsappQueueContext,
  ): Promise<WhatsappSendResult> {
    return this.sendMessage({
      to,
      text,
      pdfUrl,
      ...template,
      ...context,
    });
  }

  async processWebhookInbox(limit = 25): Promise<WhatsappInboxProcessResult> {
    if (!this.internalToken) {
      throw new Error("BATCH_WHATSAPP_INTERNAL_TOKEN not configured");
    }
    const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit) || 25));
    const endpoint = `${this.backendUrl.replace(/\/$/, "")}/whatsapp/internal/process-inbox?limit=${boundedLimit}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "x-batch-whatsapp-token": this.internalToken },
    });
    const data = (await response.json().catch(() => ({}))) as Partial<
      WhatsappInboxProcessResult & { message: string }
    >;
    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    return {
      selected: Number(data.selected ?? 0),
      processed: Number(data.processed ?? 0),
      failed: Number(data.failed ?? 0),
    };
  }

  async applyRetentionPolicy(): Promise<WhatsappRetentionResult> {
    if (!this.internalToken) {
      throw new Error("BATCH_WHATSAPP_INTERNAL_TOKEN not configured");
    }
    const endpoint = `${this.backendUrl.replace(/\/$/, "")}/whatsapp/internal/apply-retention`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "x-batch-whatsapp-token": this.internalToken },
    });
    const data = (await response.json().catch(() => ({}))) as Partial<
      WhatsappRetentionResult & { message: string }
    >;
    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    return {
      processedInboxDeleted: Number(data.processedInboxDeleted ?? 0),
      deadLettersDeleted: Number(data.deadLettersDeleted ?? 0),
      communicationsRedacted: Number(data.communicationsRedacted ?? 0),
      outboundMessagesRedacted: Number(data.outboundMessagesRedacted ?? 0),
    };
  }

  private async sendMessage(payload: {
    to: string;
    text: string;
    pdfUrl?: string;
    templateName?: string;
    templateLanguage?: string;
    templateParameters?: string[];
    companyId?: string;
    recipientRole?: WhatsappQueueContext["recipientRole"];
    recipientId?: string;
    idempotencyKey?: string;
    relatedEntityType?: WhatsappQueueContext["relatedEntityType"];
    relatedEntityId?: string;
  }): Promise<WhatsappSendResult> {
    if (!this.internalToken) {
      return {
        success: false,
        error: "BATCH_WHATSAPP_INTERNAL_TOKEN not configured",
      };
    }

    const endpoint = `${this.backendUrl.replace(/\/$/, "")}/whatsapp/messages/internal`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-batch-whatsapp-token": this.internalToken,
        },
        body: JSON.stringify(payload),
      });

      const data: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg =
          data?.message || data?.error || `HTTP ${response.status}`;
        logger.error("Batch WhatsApp send failed", {
          recipientHash: this.hashLogSubject(payload.to),
          status: response.status,
        });
        return { success: false, error: String(errorMsg) };
      }

      const documentMessageId =
        (data?.documentMessageId as string | null | undefined) ?? null;

      return {
        success: true,
        deliveryId: data?.deliveryId as string | undefined,
        status: data?.status as string | undefined,
        messageId: (data?.messageId as string | null | undefined) ?? null,
        ...(documentMessageId ? { documentMessageId } : {}),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("Batch WhatsApp request failed", {
        recipientHash: this.hashLogSubject(payload.to),
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      return { success: false, error: errorMsg };
    }
  }

  private hashLogSubject(value: string): string {
    return createHmac("sha256", this.internalToken || "whatsapp-log-redaction")
      .update(value)
      .digest("hex")
      .slice(0, 16);
  }
}
