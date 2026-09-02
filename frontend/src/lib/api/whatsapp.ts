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

export type CreateWhatsappActivityInput = {
  requestId: string;
  personType: "tenant" | "interested";
  personId: string;
  subject: string;
  body?: string;
  dueAt?: string;
  propertyId?: string;
  markReserved?: boolean;
};

export type CreateWhatsappActivityResponse = {
  activity: Record<string, unknown>;
  delivery: SendWhatsappResponse;
};

export const whatsappApi = {
  async createActivity(
    input: CreateWhatsappActivityInput,
  ): Promise<CreateWhatsappActivityResponse> {
    if (IS_MOCK_MODE) {
      return {
        activity: {
          id: input.requestId,
          type: "whatsapp",
          status: "pending",
          subject: input.subject,
          body: input.body ?? null,
          dueAt: input.dueAt ?? null,
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        delivery: {
          deliveryId: `mock-wa-${input.requestId}`,
          status: "queued",
          queued: true,
        },
      };
    }

    const token = getToken();
    return apiClient.post<CreateWhatsappActivityResponse>(
      "/whatsapp/activities",
      input,
      token ?? undefined,
    );
  },

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
