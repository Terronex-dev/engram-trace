/**
 * Engram Trace — Type Definitions
 */

// =============================================================================
// Configuration
// =============================================================================

export interface TraceConfig {
  /** Path to the .engram file (created if missing) */
  file: string;

  /** Embedding provider configuration */
  embedder?: EmbedderConfig;

  /** LLM provider for consolidation summaries (optional) */
  llm?: LLMConfig;

  /** Auto-remember settings */
  autoRemember?: boolean | AutoRememberConfig;

  /** Auto-consolidation settings */
  autoConsolidate?: boolean | ConsolidateConfig;

  /** Deduplication cosine similarity threshold (0-1). Default: 0.92 */
  deduplicateThreshold?: number;

  /** Maximum memories before forced consolidation. Default: 10000 */
  maxMemories?: number;

  /** Enable debug logging. Default: false */
  debug?: boolean;
}

export interface EmbedderConfig {
  /** Provider: 'local' (default), 'ollama', 'openai' */
  provider: 'local' | 'ollama' | 'openai';

  /** Model name. Default: 'Xenova/all-MiniLM-L6-v2' */
  model?: string;

  /** API key (for openai provider) */
  apiKey?: string;

  /** Ollama URL. Default: 'http://localhost:11434' */
  url?: string;
}

export interface LLMConfig {
  /** Provider: 'ollama', 'anthropic', 'openai' */
  provider: 'ollama' | 'anthropic' | 'openai';

  /** Model name */
  model: string;

  /** API key (for cloud providers) */
  apiKey?: string;

  /** Ollama URL. Default: 'http://localhost:11434' */
  url?: string;

  /** Max tokens for consolidation summaries. Default: 300 */
  maxTokens?: number;
}

export interface AutoRememberConfig {
  /** Enable the heuristic importance classifier. Default: true */
  heuristic?: boolean;

  /** Minimum importance score to store (0-1). Default: 0.3 */
  minImportance?: number;

  /** Tags to always apply to auto-remembered content */
  defaultTags?: string[];
}

export interface ConsolidateConfig {
  /** Trigger consolidation every N writes. Default: 100 */
  everyNWrites?: number;

  /** Trigger consolidation on this interval (ms). Default: 21600000 (6h) */
  intervalMs?: number;

  /** Minimum cluster size for summarization. Default: 3 */
  minClusterSize?: number;

  /** Cosine similarity threshold for clustering. Default: 0.78 */
  clusterThreshold?: number;

  /** Days before HOT decays to WARM. Default: 7 */
  hotDays?: number;

  /** Days before WARM decays to COLD. Default: 30 */
  warmDays?: number;

  /** Days before COLD decays to ARCHIVE. Default: 365 */
  coldDays?: number;
}

// =============================================================================
// Memory Entries
// =============================================================================

export enum MemoryTier {
  HOT = 'hot',
  WARM = 'warm',
  COLD = 'cold',
  ARCHIVE = 'archive',
}

export interface Memory {
  id: string;
  content: string;
  embedding: Float32Array;
  tags: string[];
  importance: number;
  tier: MemoryTier;
  createdAt: string;
  lastAccessed: string;
  accessCount: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface RecallResult {
  memory: Memory;
  score: number;
}

export interface RecallOptions {
  /** Max results. Default: 8 */
  limit?: number;

  /** Minimum similarity score. Default: 0.15 */
  minScore?: number;

  /** Filter by tiers. Default: all tiers */
  tiers?: MemoryTier[];

  /** Filter by tags */
  tags?: string[];

  /** Apply temporal decay boost. Default: true */
  decayBoost?: boolean;
}

export interface RememberOptions {
  importance?: number;
  tags?: string[];
  source?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Stats
// =============================================================================

export interface TraceStats {
  file: string;
  fileSizeMB: number;
  totalMemories: number;
  byTier: Record<MemoryTier, number>;
  oldestMemory: string | null;
  newestMemory: string | null;
  lastConsolidation: string | null;
  writesSinceConsolidation: number;
  embeddingModel: string;
  embeddingDims: number;
}

// =============================================================================
// Consolidation Report
// =============================================================================

export interface ConsolidationReport {
  timestamp: string;
  durationMs: number;
  clustersFound: number;
  memoriesMerged: number;
  memoriesDecayed: number;
  memoriesArchived: number;
  duplicatesRemoved: number;
  before: { total: number; byTier: Record<MemoryTier, number> };
  after: { total: number; byTier: Record<MemoryTier, number> };
}

// =============================================================================
// Provider Interfaces
// =============================================================================

export interface Embedder {
  embed(text: string): Promise<Float32Array>;
  dims: number;
}

export interface LLM {
  generate(prompt: string, system?: string): Promise<string>;
}

// =============================================================================
// Bootstrap Context
// =============================================================================

export interface BootstrapContext {
  identity: string;
  priorities: string;
  decisions: string;
  preferences: string;
  raw: RecallResult[][];
}
