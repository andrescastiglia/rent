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

export const whatsappApi = {
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
