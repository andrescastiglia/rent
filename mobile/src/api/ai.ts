import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';

export type AiToolsMode = 'NONE' | 'READONLY' | 'FULL';

type AiToolsStatusResponse = {
  mode: AiToolsMode;
  tools: Array<{ name: string; description: string; enabled: boolean }>;
};

type AiRespondResponse = {
  mode: AiToolsMode;
  conversationId: string;
  model: string;
  outputText: string;
  toolState?: Record<string, unknown>;
  usage?: Record<string, unknown>;
};

export type AiConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string | null;
  createdAt: string;
};

type AiConversationResponse = {
  conversationId: string;
  messages: AiConversationMessage[];
  toolState?: Record<string, unknown>;
  lastActivityAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export const aiApi = {
  async getToolsStatus(): Promise<AiToolsStatusResponse> {
    if (IS_MOCK_MODE) {
      return { mode: 'NONE', tools: [] };
    }

    return apiClient.get<AiToolsStatusResponse>('/ai/tools');
  },

  async respond(prompt: string, params?: { conversationId?: string }): Promise<AiRespondResponse> {
    if (IS_MOCK_MODE) {
      return {
        mode: 'NONE',
        conversationId: params?.conversationId ?? `mock-${Date.now()}`,
        model: 'mock',
        outputText: `Mock AI: ${prompt}`,
      };
    }

    return apiClient.post<AiRespondResponse>('/ai/tools/respond', {
      prompt,
      conversationId: params?.conversationId,
    });
  },

  async getConversation(conversationId: string): Promise<AiConversationResponse> {
    if (IS_MOCK_MODE) {
      return {
        conversationId,
        messages: [],
      };
    }

    return apiClient.get<AiConversationResponse>(`/ai/tools/conversations/${conversationId}`);
  },
};
