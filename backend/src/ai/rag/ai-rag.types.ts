import {
  UserModulePermissions,
  UserRole,
} from '../../users/entities/user.entity';

export type AiRagStrategy =
  'structured' | 'semantic' | 'hybrid' | 'mutation' | 'unsupported';

export type AiRagContext = {
  userId: string;
  companyId: string;
  conversationId: string;
  role: UserRole;
  permissions?: UserModulePermissions;
};

export type AiRagSource = {
  sourceId: string;
  entityType: string;
  entityId: string;
  label: string;
  updatedAt: string;
  content: string;
  origin: 'vector' | 'structured';
  retrievalScore?: number;
};

export type AiRagAnswer = {
  answer: string;
  insufficientEvidence: boolean;
  claims: Array<{ text: string; sourceIds: string[] }>;
  suggestedAction: string | null;
};

export type AiRagUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
};

export type AiRagResponse = {
  conversationId: string;
  model: string;
  outputText: string;
  insufficientEvidence: boolean;
  sources: Array<Omit<AiRagSource, 'content' | 'origin'>>;
  retrieval: {
    strategy: Exclude<AiRagStrategy, 'mutation' | 'unsupported'>;
    resultCount: number;
  };
  usage?: AiRagUsage;
};
