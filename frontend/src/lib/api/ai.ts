import { apiClient, IS_MOCK_MODE } from "../api";
import { getToken } from "../auth";

export type AiToolsMode = "NONE" | "READONLY" | "FULL";

type AiToolInfo = {
  name: string;
  description: string;
  mutability: "readonly" | "mutable";
  enabled: boolean;
  allowedRoles: string[];
};

type AiToolsStatusResponse = {
  mode: AiToolsMode;
  tools: AiToolInfo[];
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
  role: "user" | "assistant";
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
  getToolsStatus: async (): Promise<AiToolsStatusResponse> => {
    if (IS_MOCK_MODE) {
      return {
        mode: "NONE",
        tools: [],
      };
    }

    const token = getToken();
    return apiClient.get<AiToolsStatusResponse>(
      "/ai/tools",
      token ?? undefined,
    );
  },

  respond: async (
    prompt: string,
    params?: { conversationId?: string },
  ): Promise<AiRespondResponse> => {
    const token = getToken();
    return apiClient.post<AiRespondResponse>(
      "/ai/tools/respond",
      { prompt, conversationId: params?.conversationId },
      token ?? undefined,
    );
  },

  getConversation: async (
    conversationId: string,
  ): Promise<AiConversationResponse> => {
    const token = getToken();
    return apiClient.get<AiConversationResponse>(
      `/ai/tools/conversations/${conversationId}`,
      token ?? undefined,
    );
  },
};
