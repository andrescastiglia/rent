import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';

export type SendWhatsappInput = {
  to: string;
  text: string;
  pdfUrl?: string;
};

export type SendWhatsappResponse = {
  messageId: string | null;
  raw: unknown;
};

export const whatsappApi = {
  async sendMessage(payload: SendWhatsappInput): Promise<SendWhatsappResponse> {
    if (IS_MOCK_MODE) {
      return {
        messageId: `mock-wa-${Date.now()}`,
        raw: { mocked: true },
      };
    }

    return apiClient.post<SendWhatsappResponse>('/whatsapp/messages', payload);
  },
};
