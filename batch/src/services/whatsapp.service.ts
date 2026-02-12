import { logger } from "../shared/logger";

export interface WhatsappSendResult {
  success: boolean;
  messageId?: string | null;
  error?: string;
}

export class WhatsappService {
  private readonly backendUrl =
    process.env.BATCH_BACKEND_API_URL ?? "http://localhost:3001";
  private readonly internalToken =
    process.env.BATCH_WHATSAPP_INTERNAL_TOKEN ?? "";

  async sendTextMessage(
    to: string,
    text: string,
    pdfUrl?: string,
  ): Promise<WhatsappSendResult> {
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
        body: JSON.stringify({ to, text, pdfUrl }),
      });

      const data: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg =
          data?.message || data?.error || `HTTP ${response.status}`;
        logger.error("Batch WhatsApp send failed", {
          to,
          status: response.status,
          error: errorMsg,
        });
        return { success: false, error: String(errorMsg) };
      }

      return {
        success: true,
        messageId: (data?.messageId as string | null | undefined) ?? null,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("Batch WhatsApp request failed", { to, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }
}
