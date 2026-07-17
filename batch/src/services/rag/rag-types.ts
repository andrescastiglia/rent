export const RAG_EMBEDDING_DIMENSIONS = 1536;
export const RAG_EMBEDDING_VERSION = 1;
export const RAG_DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export const RAG_SOURCE_ENTITY_TYPES = [
  "property",
  "document",
  "lease",
  "invoice",
  "owner",
  "tenant_account",
  "interested",
  "owner_activity",
  "tenant_activity",
  "interested_activity",
] as const;

export type RagSourceEntityType = (typeof RAG_SOURCE_ENTITY_TYPES)[number];
export type RagCliEntityType = RagSourceEntityType | "all";
export type RagProjectionType =
  | "property_summary"
  | "document_chunk"
  | "lease_summary"
  | "invoice_payment_summary"
  | "owner_portfolio_summary"
  | "tenant_account_summary"
  | "interested_profile_summary"
  | "activity_chunk";

export const RAG_PROJECTION_BY_SOURCE: Record<
  RagSourceEntityType,
  RagProjectionType
> = {
  property: "property_summary",
  document: "document_chunk",
  lease: "lease_summary",
  invoice: "invoice_payment_summary",
  owner: "owner_portfolio_summary",
  tenant_account: "tenant_account_summary",
  interested: "interested_profile_summary",
  owner_activity: "activity_chunk",
  tenant_activity: "activity_chunk",
  interested_activity: "activity_chunk",
};

export interface RagChunkDraft {
  companyId: string;
  entityType: RagProjectionType;
  entityId: string;
  chunkKey: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
  contentHash: string;
  sourceUpdatedAt: Date;
}

export interface RagSourceEntity {
  id: string;
  companyId: string;
  updatedAt: Date;
  sourceType: RagSourceEntityType;
  data: Record<string, unknown>;
}

export interface RagBackfillOptions {
  entity: RagCliEntityType;
  companyId?: string;
  batchSize: number;
  checkpoint?: string;
  concurrency: number;
  dryRun: boolean;
  force: boolean;
}

export interface RagBackfillResult {
  processed: number;
  embedded: number;
  skipped: number;
  failed: number;
  tokens: number;
  durationMs: number;
  lastCheckpoint?: string;
  errors: Array<{ entityType: string; entityId: string; error: string }>;
}

export interface RagEntitySyncResult {
  embedded: number;
  tokens: number;
  skipped: boolean;
}

export interface RagVerificationResult {
  checked: number;
  missing: number;
  stale: number;
  invalidDimensions: number;
  orphaned: number;
  selfSearchFailures: number;
  details: Array<Record<string, unknown>>;
}

export interface RagRecallResult {
  evaluated: number;
  k: number;
  averageRecall: number;
  minimumRecall: number;
  failures: Array<{
    sourceId: string;
    recall: number;
    missingExactNeighborIds: string[];
  }>;
}

export interface EmbeddingBatchResult {
  embeddings: number[][];
  tokens: number;
  model: string;
}
