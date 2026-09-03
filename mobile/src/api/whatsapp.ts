import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';

export type SendWhatsappInput = {
  to: string;
  text: string;
  pdfUrl?: string;
  activityEntity: 'tenant' | 'owner' | 'interested';
  activityId: string;
  relatedEntityType: 'tenant' | 'owner' | 'interested';
  relatedEntityId: string;
};

export type SendWhatsappResponse = {
  deliveryId: string;
  status: string;
  queued: boolean;
};

export interface CreateWhatsappActivityInput {
  requestId: string;
  personType: 'tenant' | 'interested';
  personId: string;
  subject: string;
  body?: string;
  dueAt?: string;
  propertyId?: string;
  markReserved?: boolean;
}

export interface CreateWhatsappActivityResponse {
  activity: Record<string, unknown>;
  delivery: SendWhatsappResponse;
}

function buildMockActivity(
  input: CreateWhatsappActivityInput,
): CreateWhatsappActivityResponse {
  const timestamp = new Date().toISOString();
  const activity = {
    id: input.requestId,
    type: 'whatsapp',
    status: 'pending',
    subject: input.subject,
    body: input.body ?? null,
    dueAt: input.dueAt ?? null,
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const delivery: SendWhatsappResponse = {
    deliveryId: `mock-wa-${input.requestId}`,
    status: 'queued',
    queued: true,
  };
  return { activity, delivery };
}

async function createActivity(
  input: CreateWhatsappActivityInput,
): Promise<CreateWhatsappActivityResponse> {
  if (!IS_MOCK_MODE) {
    return apiClient.post<CreateWhatsappActivityResponse>(
      '/whatsapp/activities',
      input,
    );
  }
  return buildMockActivity(input);
}

export const whatsappApi = {
  createActivity,

  async sendMessage(payload: SendWhatsappInput): Promise<SendWhatsappResponse> {
    if (IS_MOCK_MODE) {
      return {
        deliveryId: `mock-wa-${Date.now()}`,
        status: 'queued',
        queued: true,
      };
    }

    return apiClient.post<SendWhatsappResponse>('/whatsapp/messages', payload);
  },
};
