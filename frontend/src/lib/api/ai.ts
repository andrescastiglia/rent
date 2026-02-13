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
  model: string;
  outputText: string;
  usage?: Record<string, unknown>;
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

  respond: async (prompt: string): Promise<AiRespondResponse> => {
    const token = getToken();
    return apiClient.post<AiRespondResponse>(
      "/ai/tools/respond",
      { prompt },
      token ?? undefined,
    );
  },
};
