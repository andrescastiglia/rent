import { apiClient } from "../api";
import { getToken } from "../auth";

export type CommunicationChannel = "whatsapp";
export type CommunicationRecipientRole = "tenant" | "owner" | "interested";
export type CommunicationEvent =
  | "payment_received"
  | "invoice_issued"
  | "payment_reminder"
  | "invoice_overdue"
  | "rent_adjustment"
  | "settlement_available"
  | "settlement_paid"
  | "office_prospect_welcome_rent"
  | "office_prospect_welcome_sale"
  | "property_visit_scheduled"
  | "property_visit_completed"
  | "property_visit_offer";

export type CommunicationTemplate = {
  id: string;
  name: string;
  event: CommunicationEvent;
  recipientRole: CommunicationRecipientRole;
  channel: CommunicationChannel;
  locale: string;
  subject?: string | null;
  body: string;
  isActive: boolean;
  autoSend: boolean;
  requiresApproval: boolean;
  variables: string[];
};

export type CommunicationDelivery = {
  id: string;
  event: CommunicationEvent;
  recipientRole: CommunicationRecipientRole;
  channel: CommunicationChannel;
  recipient: string;
  subject?: string | null;
  body: string;
  status: "pending_approval" | "queued" | "sent" | "failed" | "blocked";
  attempts: number;
  maxAttempts: number;
  errorMessage?: string | null;
  createdAt: string;
};

export type CommunicationTemplateInput = Omit<CommunicationTemplate, "id">;

const token = () => getToken() ?? undefined;

export const communicationsApi = {
  listTemplates: () =>
    apiClient.get<CommunicationTemplate[]>(
      "/communications/templates",
      token(),
    ),
  createTemplate: (data: CommunicationTemplateInput) =>
    apiClient.post<CommunicationTemplate>(
      "/communications/templates",
      data,
      token(),
    ),
  updateTemplate: (id: string, data: Partial<CommunicationTemplateInput>) =>
    apiClient.patch<CommunicationTemplate>(
      `/communications/templates/${id}`,
      data,
      token(),
    ),
  preview: (data: {
    templateId?: string;
    subject?: string;
    body?: string;
    variables: Record<string, string | number | boolean | null>;
  }) =>
    apiClient.post<{
      subject: string | null;
      body: string;
      missingVariables: string[];
    }>("/communications/preview", data, token()),
  sendTest: (data: {
    templateId?: string;
    subject?: string;
    body?: string;
    variables: Record<string, string | number | boolean | null>;
    channel: CommunicationChannel;
    recipient: string;
  }) =>
    apiClient.post<CommunicationDelivery>(
      "/communications/test",
      data,
      token(),
    ),
  listDeliveries: () =>
    apiClient.get<CommunicationDelivery[]>(
      "/communications/deliveries",
      token(),
    ),
  approve: (id: string) =>
    apiClient.post<CommunicationDelivery>(
      `/communications/deliveries/${id}/approve`,
      {},
      token(),
    ),
  retry: (id: string) =>
    apiClient.post<CommunicationDelivery>(
      `/communications/deliveries/${id}/retry`,
      {},
      token(),
    ),
};
