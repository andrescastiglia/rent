import { apiClient, IS_MOCK_MODE } from "../api";
import { getToken } from "../auth";

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
  async sendMessage(input: SendWhatsappInput): Promise<SendWhatsappResponse> {
    if (IS_MOCK_MODE) {
      return {
        messageId: `mock-wa-${Date.now()}`,
        raw: { mocked: true },
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
