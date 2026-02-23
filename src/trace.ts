/**
 * Engram Trace — Main Agent Memory Class
 *
 * The primary API surface. Wraps an .engram file with autonomous
 * memory intelligence: auto-remember, auto-curate, semantic recall.
 */
import { existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';

import type {
  TraceConfig,
  Memory,
  MemoryTier,
  RecallResult,
  RecallOptions,
  RememberOptions,
  TraceStats,
  BootstrapContext,
  ConsolidationReport,
  Embedder,
  LLM,
  AutoRememberConfig,
  ConsolidateConfig,
} from './types.js';
import { MemoryTier as Tier } from './types.js';
import { createEmbedder } from './embedder.js';
import { createLLM } from './llm.js';
import { Classifier, type ClassificationResult } from './classifier.js';
import { Consolidator } from './consolidator.js';

// =============================================================================
// Engram Trace
// =============================================================================

export class EngramTrace {
  private file: string;
  private embedder: Embedder;
  private llm: LLM | null;
  private classifier: Classifier;
  private consolidator: Consolidator;
  private memories: Memory[] = [];
  private embeddingsByIndex: Map<string, Float32Array> = new Map();
  private initialized = false;
  private dirty = false;
  private writesSinceConsolidation = 0;
  private lastConsolidation: string | null = null;
  private consolidateTimer: ReturnType<typeof setInterval> | null = null;
  private debug: boolean;

  // Config
  private autoRememberEnabled: boolean;
  private autoRememberConfig: AutoRememberConfig;
  private autoConsolidateEnabled: boolean;
  private consolidateConfig: ConsolidateConfig;
  private deduplicateThreshold: number;
  private maxMemories: number;

  constructor(config: TraceConfig) {
    this.file = config.file;
    this.debug = config.debug ?? false;

    // Providers
    this.embedder = createEmbedder(config.embedder);
    this.llm = createLLM(config.llm);

    // Auto-remember config
    if (typeof config.autoRemember === 'boolean') {
      this.autoRememberEnabled = config.autoRemember;
      this.autoRememberConfig = { heuristic: true, minImportance: 0.3, defaultTags: [] };
    } else if (config.autoRemember) {
      this.autoRememberEnabled = true;
      this.autoRememberConfig = {
        heuristic: config.autoRemember.heuristic ?? true,
        minImportance: config.autoRemember.minImportance ?? 0.3,
        defaultTags: config.autoRemember.defaultTags ?? [],
      };
    } else {
      this.autoRememberEnabled = true;  // Default: on
      this.autoRememberConfig = { heuristic: true, minImportance: 0.3, defaultTags: [] };
    }

    // Auto-consolidate config
    if (typeof config.autoConsolidate === 'boolean') {
      this.autoConsolidateEnabled = config.autoConsolidate;
      this.consolidateConfig = {};
    } else if (config.autoConsolidate) {
      this.autoConsolidateEnabled = true;
      this.consolidateConfig = config.autoConsolidate;
    } else {
      this.autoConsolidateEnabled = true;  // Default: on
      this.consolidateConfig = {};
    }

    this.deduplicateThreshold = config.deduplicateThreshold ?? 0.92;
    this.maxMemories = config.maxMemories ?? 10000;

    // Internal modules
    this.classifier = new Classifier({
      deduplicateThreshold: this.deduplicateThreshold,
      minImportance: this.autoRememberConfig.minImportance,
    });
    this.consolidator = new Consolidator(this.consolidateConfig, this.llm, this.deduplicateThreshold);
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Initialize: load existing .engram file or create new one.
   * Must be called before any other method.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Ensure directory exists
    const dir = dirname(this.file);
    await mkdir(dir, { recursive: true });

    if (existsSync(this.file)) {
      await this.load();
    }

    // Start auto-consolidation timer
    if (this.autoConsolidateEnabled && this.consolidateConfig.intervalMs !== 0) {
      const interval = this.consolidateConfig.intervalMs ?? 6 * 60 * 60 * 1000;
      this.consolidateTimer = setInterval(() => {
        this.consolidate().catch(e => {
          if (this.debug) console.error('[engram-trace] Auto-consolidation failed:', e);
        });
      }, interval);
      // Don't block process exit
      if (this.consolidateTimer.unref) this.consolidateTimer.unref();
    }

    this.initialized = true;
    this.log(`Initialized: ${this.memories.length} memories from ${this.file}`);
  }

  /**
   * Save current state to disk and clean up.
   */
  async close(): Promise<void> {
    if (this.consolidateTimer) {
      clearInterval(this.consolidateTimer);
      this.consolidateTimer = null;
    }
    if (this.dirty) {
      await this.save();
    }
  }

  // ===========================================================================
  // Core API
  // ===========================================================================

  /**
   * Bootstrap context for session start.
   * Runs 4 broad recall queries and returns structured context.
   */
  async bootstrap(): Promise<BootstrapContext> {
    this.ensureInit();

    const queries = [
      'who am I, who is my user, my identity and role',
      'active projects, current priorities, what am I working on',
      'recent decisions, key choices, open blockers',
      'user preferences, communication style, important rules',
    ];

    const results = await Promise.all(
      queries.map(q => this.recall(q, { limit: 4, minScore: 0.15 }))
    );

    const format = (items: RecallResult[]) =>
      items.map(r => r.memory.content).join('\n');

    return {
      identity: format(results[0]),
      priorities: format(results[1]),
      decisions: format(results[2]),
      preferences: format(results[3]),
      raw: results,
    };
  }

  /**
   * Process a conversation turn. Classifies and auto-stores if worthy.
   * Returns the classification result (stored or not, and why).
   */
  async process(
    userMessage: string,
    assistantResponse: string,
  ): Promise<ClassificationResult> {
    this.ensureInit();

    if (!this.autoRememberEnabled) {
      return { shouldRemember: false, importance: 0, reason: 'auto-remember disabled', suggestedTags: [] };
    }

    // Generate embedding for the combined content
    const combined = this.extractMemoryContent(userMessage, assistantResponse);
    const embedding = await this.embedder.embed(combined);

    // Get existing embeddings for dedup
    const existingEmbeddings = this.memories.map(m => m.embedding);

    // Classify
    const result = await this.classifier.classify(
      userMessage,
      assistantResponse,
      existingEmbeddings,
      embedding,
    );

    if (result.shouldRemember) {
      const tags = [...(this.autoRememberConfig.defaultTags ?? []), ...result.suggestedTags];
      await this.store(combined, embedding, {
        importance: result.importance,
        tags,
        source: 'auto',
        metadata: { reason: result.reason },
      });
    }

    return result;
  }

  /**
   * Explicitly remember something.
   */
  async remember(content: string, options?: RememberOptions): Promise<Memory> {
    this.ensureInit();

    const embedding = await this.embedder.embed(content);
    return this.store(content, embedding, options);
  }

  /**
   * Semantic recall with tier-aware scoring.
   */
  async recall(query: string, options?: RecallOptions): Promise<RecallResult[]> {
    this.ensureInit();

    const limit = options?.limit ?? 8;
    const minScore = options?.minScore ?? 0.15;
    const tiers = options?.tiers;
    const tags = options?.tags;
    const decayBoost = options?.decayBoost ?? true;

    const queryEmbedding = await this.embedder.embed(query);

    let candidates = this.memories;

    // Filter by tier
    if (tiers && tiers.length > 0) {
      candidates = candidates.filter(m => tiers.includes(m.tier));
    }

    // Filter by tags
    if (tags && tags.length > 0) {
      candidates = candidates.filter(m => tags.some(t => m.tags.includes(t)));
    }

    // Score all candidates
    const scored: RecallResult[] = [];
    for (const memory of candidates) {
      let score = this.cosineSimilarity(queryEmbedding, memory.embedding);

      // Tier boost: HOT memories get a slight relevance boost
      if (decayBoost) {
        if (memory.tier === Tier.HOT) score *= 1.1;
        else if (memory.tier === Tier.WARM) score *= 1.0;
        else if (memory.tier === Tier.COLD) score *= 0.95;
        else if (memory.tier === Tier.ARCHIVE) score *= 0.85;
      }

      // Importance boost
      score *= (1 + memory.importance * 0.2);

      if (score >= minScore) {
        scored.push({ memory, score });
      }
    }

    // Sort by score, take top limit
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, limit);

    // Update access counts
    const now = new Date().toISOString();
    for (const r of results) {
      r.memory.accessCount++;
      r.memory.lastAccessed = now;
    }
    if (results.length > 0) this.dirty = true;

    return results;
  }

  /**
   * Forget memories matching a query (for corrections, GDPR, etc.).
   * Returns number of memories removed.
   */
  async forget(query: string, threshold = 0.8): Promise<number> {
    this.ensureInit();

    const queryEmbedding = await this.embedder.embed(query);
    const before = this.memories.length;

    this.memories = this.memories.filter(m => {
      const sim = this.cosineSimilarity(queryEmbedding, m.embedding);
      return sim < threshold;
    });

    const removed = before - this.memories.length;
    if (removed > 0) {
      this.dirty = true;
      this.log(`Forgot ${removed} memories matching "${query.slice(0, 50)}"`);
    }
    return removed;
  }

  /**
   * Run consolidation manually.
   */
  async consolidate(): Promise<ConsolidationReport> {
    this.ensureInit();

    this.log(`Consolidating ${this.memories.length} memories...`);
    const { memories, report } = await this.consolidator.consolidate(this.memories);
    this.memories = memories;
    this.dirty = true;
    this.writesSinceConsolidation = 0;
    this.lastConsolidation = report.timestamp;
    await this.save();

    this.log(`Consolidation complete: ${report.duplicatesRemoved} deduped, ${report.memoriesMerged} merged, ${report.memoriesDecayed} decayed`);
    return report;
  }

  /**
   * Get stats about the current state.
   */
  stats(): TraceStats {
    const byTier = { hot: 0, warm: 0, cold: 0, archive: 0 } as Record<MemoryTier, number>;
    let oldest: string | null = null;
    let newest: string | null = null;

    for (const m of this.memories) {
      byTier[m.tier] = (byTier[m.tier] || 0) + 1;
      if (!oldest || m.createdAt < oldest) oldest = m.createdAt;
      if (!newest || m.createdAt > newest) newest = m.createdAt;
    }

    let fileSizeMB = 0;
    try {
      fileSizeMB = existsSync(this.file) ? statSync(this.file).size / 1048576 : 0;
    } catch {}

    return {
      file: this.file,
      fileSizeMB: parseFloat(fileSizeMB.toFixed(2)),
      totalMemories: this.memories.length,
      byTier,
      oldestMemory: oldest,
      newestMemory: newest,
      lastConsolidation: this.lastConsolidation,
      writesSinceConsolidation: this.writesSinceConsolidation,
      embeddingModel: (this.embedder as any).model || 'unknown',
      embeddingDims: this.embedder.dims,
    };
  }

  /**
   * Export all memories as JSON (for debugging/migration).
   */
  export(): Array<Omit<Memory, 'embedding'> & { embeddingDims: number }> {
    return this.memories.map(m => ({
      ...m,
      embedding: undefined as any,
      embeddingDims: m.embedding.length,
    }));
  }

  // ===========================================================================
  // Internal — Storage
  // ===========================================================================

  private async store(
    content: string,
    embedding: Float32Array,
    options?: RememberOptions,
  ): Promise<Memory> {
    const now = new Date().toISOString();

    const memory: Memory = {
      id: crypto.randomUUID(),
      content,
      embedding,
      tags: options?.tags ?? [],
      importance: options?.importance ?? 0.5,
      tier: Tier.HOT,
      createdAt: now,
      lastAccessed: now,
      accessCount: 0,
      source: options?.source,
      metadata: options?.metadata,
    };

    this.memories.push(memory);
    this.dirty = true;
    this.writesSinceConsolidation++;

    // Auto-consolidate if threshold reached
    if (
      this.autoConsolidateEnabled &&
      this.consolidateConfig.everyNWrites &&
      this.writesSinceConsolidation >= (this.consolidateConfig.everyNWrites ?? 100)
    ) {
      // Run async, don't block the write
      this.consolidate().catch(e => {
        if (this.debug) console.error('[engram-trace] Auto-consolidation failed:', e);
      });
    }

    // Hard limit check
    if (this.memories.length > this.maxMemories) {
      this.log(`Memory limit reached (${this.memories.length}/${this.maxMemories}), forcing consolidation`);
      await this.consolidate();
    }

    return memory;
  }

  /**
   * Extract the memory-worthy content from a conversation turn.
   * Combines user + assistant but trims boilerplate.
   */
  private extractMemoryContent(user: string, assistant: string): string {
    // Take user message + first meaningful paragraph of assistant response
    const userClean = user.trim();
    const assistantClean = assistant.trim();

    // If assistant response is very long, take summary-sized chunk
    const maxAssistant = 500;
    const assistantTruncated = assistantClean.length > maxAssistant
      ? assistantClean.slice(0, maxAssistant) + '...'
      : assistantClean;

    return `User: ${userClean}\nAssistant: ${assistantTruncated}`;
  }

  // ===========================================================================
  // Internal — Persistence (using @terronex/engram)
  // ===========================================================================

  private async load(): Promise<void> {
    try {
      // Dynamic import of engram
      const engram = await import('@terronex/engram');
      const data = await engram.readEngramFile(this.file);

      if (!data || !data.nodes || data.nodes.length === 0) {
        this.log('Empty or invalid .engram file, starting fresh');
        return;
      }

      // Convert engram MemoryNodes to Trace Memory objects
      for (const node of data.nodes) {
        if (!node.content) continue;

        // Extract text content
        const content = typeof node.content.data === 'string'
          ? node.content.data
          : '';
        if (!content) continue;

        const embedding = node.embedding
          ? (node.embedding instanceof Float32Array ? node.embedding : new Float32Array(node.embedding))
          : new Float32Array(0);

        const meta = node.metadata || {} as Record<string, unknown>;
        const custom = (meta as any).custom || {};

        this.memories.push({
          id: node.id || crypto.randomUUID(),
          content,
          embedding,
          tags: (custom.tags as string[]) || (meta as any).tags || [],
          importance: (custom.importance as number) ?? (node.quality?.score ?? 0.5),
          tier: (custom.tier as MemoryTier) || (node.temporal?.decayTier as MemoryTier) || Tier.HOT,
          createdAt: node.temporal?.created ? new Date(node.temporal.created).toISOString() : new Date().toISOString(),
          lastAccessed: node.temporal?.accessed ? new Date(node.temporal.accessed).toISOString() : new Date().toISOString(),
          accessCount: (custom.accessCount as number) || 0,
          source: custom.source as string | undefined,
          metadata: custom,
        });
      }

      this.log(`Loaded ${this.memories.length} memories from ${this.file}`);
    } catch (e) {
      this.log(`Failed to load ${this.file}: ${e}. Starting fresh.`);
    }
  }

  async save(): Promise<void> {
    if (!this.dirty && existsSync(this.file)) return;

    try {
      const engram = await import('@terronex/engram');

      const nodes = this.memories.map(m => {
        const node = engram.createNode(m.content);
        node.embedding = new Float32Array(m.embedding);
        node.id = m.id;
        node.temporal = {
          created: new Date(m.createdAt).getTime(),
          modified: Date.now(),
          accessed: new Date(m.lastAccessed).getTime(),
          decayTier: m.tier,
        };
        node.quality = {
          score: m.importance,
          confidence: 1,
          source: (m.source || 'trace') as any,
        };
        node.metadata = {
          ...(node.metadata || {}),
          custom: {
            tags: m.tags,
            importance: m.importance,
            tier: m.tier,
            createdAt: m.createdAt,
            lastAccessed: m.lastAccessed,
            accessCount: m.accessCount,
            source: m.source,
            ...(m.metadata || {}),
          },
        } as any;
        return node;
      });

      const file: any = {
        header: {
          version: [1, 0],
          created: Date.now(),
          modified: Date.now(),
          security: { encrypted: false, algorithm: 'none', kdf: 'none', integrity: new Uint8Array(0) },
          metadata: {
            source: 'engram-trace',
            description: `Trace memory: ${this.memories.length} memories`,
          },
          schema: { version: 1, contentTypes: ['text'] },
          stats: { nodeCount: nodes.length, totalBytes: 0, maxDepth: 0 },
        },
        nodes,
        entities: [],
        links: [],
      };

      await engram.writeEngramFile(this.file, file);
      this.dirty = false;
      this.log(`Saved ${this.memories.length} memories to ${this.file}`);
    } catch (e) {
      // Fallback: save as JSON if engram format fails
      const { writeFile } = await import('node:fs/promises');
      const data = this.memories.map(m => ({
        ...m,
        embedding: Array.from(m.embedding),
      }));
      await writeFile(this.file, JSON.stringify({ version: 1, format: 'engram-trace', memories: data }, null, 2));
      this.dirty = false;
      this.log(`Saved ${this.memories.length} memories as JSON fallback to ${this.file}`);
    }
  }

  // ===========================================================================
  // Utils
  // ===========================================================================

  private ensureInit(): void {
    if (!this.initialized) {
      throw new Error('EngramTrace not initialized. Call .init() first.');
    }
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  private log(msg: string): void {
    if (this.debug) console.log(`[engram-trace] ${msg}`);
  }
}
