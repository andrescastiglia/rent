export const RAG_EMBEDDING_DIMENSIONS = 1536;
export const RAG_EMBEDDING_VERSION = 1;
export const RAG_DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export type RagSourceEntityType = "property" | "document";
export type RagCliEntityType = RagSourceEntityType | "all";
export type RagProjectionType = "property_summary" | "document_chunk";

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

export interface EmbeddingBatchResult {
  embeddings: number[][];
  tokens: number;
  model: string;
}
