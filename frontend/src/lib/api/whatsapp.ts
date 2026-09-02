import { apiClient, IS_MOCK_MODE } from "../api";
import { getToken } from "../auth";

export type SendWhatsappInput = {
  to: string;
  text: string;
  pdfUrl?: string;
  templateName?: string;
  templateLanguage?: string;
  templateParameters?: string[];
  activityEntity?: "tenant" | "owner" | "interested";
  activityId?: string;
  relatedEntityType?:
    | "tenant"
    | "owner"
    | "interested"
    | "property_visit"
    | "invoice"
    | "payment"
    | "lease";
  relatedEntityId?: string;
  companyId?: string;
};

export type SendWhatsappResponse = {
  deliveryId: string;
  status: string;
  queued: boolean;
};

export const whatsappApi = {
  async sendMessage(input: SendWhatsappInput): Promise<SendWhatsappResponse> {
    if (IS_MOCK_MODE) {
      return {
        deliveryId: `mock-wa-${Date.now()}`,
        status: "queued",
        queued: true,
      };
    }

    const token = getToken();
    return apiClient.post<SendWhatsappResponse>(
      "/whatsapp/messages",
      input,
      token ?? undefined,
    );
  },
};
