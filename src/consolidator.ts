/**
 * Engram Trace — Consolidation Engine
 *
 * Periodically clusters, summarizes, deduplicates, and decays memories.
 * Runs without an LLM (dedup + decay only) or with one (full summarization).
 *
 * Consolidation phases:
 *   1. Decay — age memories through tiers based on time + access patterns
 *   2. Deduplicate — remove near-identical memories (cosine > threshold)
 *   3. Cluster — group similar memories by embedding proximity
 *   4. Summarize — collapse clusters into condensed memories (requires LLM)
 *   5. Archive — compress old summaries, remove stale data
 */

import type {
  Memory,
  MemoryTier,
  LLM,
  ConsolidateConfig,
  ConsolidationReport,
} from './types.js';
import { MemoryTier as Tier } from './types.js';

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_CONFIG: Required<ConsolidateConfig> = {
  everyNWrites: 100,
  intervalMs: 6 * 60 * 60 * 1000,  // 6 hours
  minClusterSize: 3,
  clusterThreshold: 0.78,
  hotDays: 7,
  warmDays: 30,
  coldDays: 365,
};

// =============================================================================
// Consolidator
// =============================================================================

export class Consolidator {
  private config: Required<ConsolidateConfig>;
  private llm: LLM | null;
  private deduplicateThreshold: number;

  constructor(
    config?: ConsolidateConfig,
    llm?: LLM | null,
    deduplicateThreshold = 0.92,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.llm = llm ?? null;
    this.deduplicateThreshold = deduplicateThreshold;
  }

  /**
   * Run full consolidation on a set of memories.
   * Returns updated memories + a report.
   */
  async consolidate(memories: Memory[]): Promise<{
    memories: Memory[];
    report: ConsolidationReport;
  }> {
    const start = Date.now();
    const before = this.countByTier(memories);
    let current = [...memories];

    // Phase 1: Decay
    const decayed = this.decay(current);
    const memoriesDecayed = decayed.changed;
    current = decayed.memories;

    // Phase 2: Deduplicate
    const deduped = this.deduplicate(current);
    const duplicatesRemoved = deduped.removed;
    current = deduped.memories;

    // Phase 3: Cluster
    const clusters = this.cluster(current);

    // Phase 4: Summarize (if LLM available)
    let memoriesMerged = 0;
    if (this.llm && clusters.length > 0) {
      const summarized = await this.summarizeClusters(current, clusters);
      memoriesMerged = summarized.merged;
      current = summarized.memories;
    }

    // Phase 5: Archive old COLD memories
    const archived = this.archive(current);
    const memoriesArchived = archived.changed;
    current = archived.memories;

    const after = this.countByTier(current);

    return {
      memories: current,
      report: {
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start,
        clustersFound: clusters.length,
        memoriesMerged,
        memoriesDecayed,
        memoriesArchived,
        duplicatesRemoved,
        before: { total: memories.length, byTier: before },
        after: { total: current.length, byTier: after },
      },
    };
  }

  // ===========================================================================
  // Phase 1: Decay
  // ===========================================================================

  private decay(memories: Memory[]): { memories: Memory[]; changed: number } {
    const now = Date.now();
    let changed = 0;

    const updated = memories.map(m => {
      const ageMs = now - new Date(m.createdAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      // Access frequency slows decay — frequently accessed memories stay hot
      const accessBoost = Math.min(m.accessCount * 0.5, 5); // Max 5 days boost per access
      const effectiveAge = ageDays - accessBoost;

      // High-importance memories decay slower
      const importanceMultiplier = 1 + (m.importance * 2); // 1x-3x
      const adjustedAge = effectiveAge / importanceMultiplier;

      let newTier: MemoryTier = m.tier;

      if (m.tier === Tier.HOT && adjustedAge > this.config.hotDays) {
        newTier = Tier.WARM;
      } else if (m.tier === Tier.WARM && adjustedAge > this.config.warmDays) {
        newTier = Tier.COLD;
      } else if (m.tier === Tier.COLD && adjustedAge > this.config.coldDays) {
        newTier = Tier.ARCHIVE;
      }

      if (newTier !== m.tier) {
        changed++;
        return { ...m, tier: newTier };
      }
      return m;
    });

    return { memories: updated, changed };
  }

  // ===========================================================================
  // Phase 2: Deduplicate
  // ===========================================================================

  private deduplicate(memories: Memory[]): { memories: Memory[]; removed: number } {
    if (memories.length < 2) return { memories, removed: 0 };

    const keep = new Set<number>();
    const remove = new Set<number>();

    for (let i = 0; i < memories.length; i++) {
      if (remove.has(i)) continue;

      for (let j = i + 1; j < memories.length; j++) {
        if (remove.has(j)) continue;

        const sim = this.cosineSimilarity(memories[i].embedding, memories[j].embedding);
        if (sim > this.deduplicateThreshold) {
          // Keep the one with higher importance or more accesses
          const scoreI = memories[i].importance + memories[i].accessCount * 0.1;
          const scoreJ = memories[j].importance + memories[j].accessCount * 0.1;

          if (scoreI >= scoreJ) {
            remove.add(j);
          } else {
            remove.add(i);
            break; // i is removed, move on
          }
        }
      }
    }

    const filtered = memories.filter((_, idx) => !remove.has(idx));
    return { memories: filtered, removed: remove.size };
  }

  // ===========================================================================
  // Phase 3: Cluster
  // ===========================================================================

  /**
   * Find clusters of similar memories using greedy nearest-neighbor.
   * Returns indices of clustered memories.
   */
  private cluster(memories: Memory[]): number[][] {
    if (memories.length < this.config.minClusterSize) return [];

    // Only cluster WARM and COLD memories (HOT are too recent)
    const candidates = memories
      .map((m, i) => ({ memory: m, index: i }))
      .filter(c => c.memory.tier === Tier.WARM || c.memory.tier === Tier.COLD);

    if (candidates.length < this.config.minClusterSize) return [];

    const assigned = new Set<number>();
    const clusters: number[][] = [];

    for (const candidate of candidates) {
      if (assigned.has(candidate.index)) continue;

      const cluster = [candidate.index];
      assigned.add(candidate.index);

      for (const other of candidates) {
        if (assigned.has(other.index)) continue;

        const sim = this.cosineSimilarity(
          candidate.memory.embedding,
          other.memory.embedding,
        );

        if (sim >= this.config.clusterThreshold) {
          cluster.push(other.index);
          assigned.add(other.index);
        }
      }

      if (cluster.length >= this.config.minClusterSize) {
        clusters.push(cluster);
      } else {
        // Un-assign if cluster too small
        for (const idx of cluster) {
          if (idx !== candidate.index) assigned.delete(idx);
        }
        assigned.delete(candidate.index);
      }
    }

    return clusters;
  }

  // ===========================================================================
  // Phase 4: Summarize
  // ===========================================================================

  private async summarizeClusters(
    memories: Memory[],
    clusters: number[][],
  ): Promise<{ memories: Memory[]; merged: number }> {
    if (!this.llm || clusters.length === 0) return { memories, merged: 0 };

    let result = [...memories];
    let totalMerged = 0;
    const toRemove = new Set<number>();

    for (const cluster of clusters) {
      const clusterMemories = cluster.map(i => memories[i]);
      const texts = clusterMemories.map(m => m.content).join('\n---\n');

      try {
        const summary = await this.llm.generate(
          `Consolidate these related memories into a single concise summary. Preserve all important facts, decisions, and details. Remove redundancy.\n\nMemories:\n${texts}`,
          'You are a memory consolidation system. Output only the consolidated summary, nothing else. Be concise but preserve all key information.',
        );

        if (summary && summary.length > 10) {
          // Replace cluster with summary — keep the highest-importance entry, update its content
          const best = clusterMemories.reduce((a, b) =>
            (a.importance + a.accessCount * 0.1) >= (b.importance + b.accessCount * 0.1) ? a : b
          );

          // Mark all cluster members for removal except the best one
          for (const idx of cluster) {
            if (memories[idx].id !== best.id) {
              toRemove.add(idx);
            }
          }

          // Update the best one with the summary
          const bestIdx = result.findIndex(m => m.id === best.id);
          if (bestIdx !== -1) {
            result[bestIdx] = {
              ...result[bestIdx],
              content: summary,
              tags: [...new Set([...result[bestIdx].tags, 'consolidated'])],
              importance: Math.max(...clusterMemories.map(m => m.importance)),
              metadata: {
                ...result[bestIdx].metadata,
                consolidatedFrom: cluster.length,
                consolidatedAt: new Date().toISOString(),
              },
            };
          }

          totalMerged += cluster.length - 1;
        }
      } catch (e) {
        // LLM failed — skip this cluster, no data loss
        continue;
      }
    }

    result = result.filter((_, idx) => !toRemove.has(idx));
    return { memories: result, merged: totalMerged };
  }

  // ===========================================================================
  // Phase 5: Archive
  // ===========================================================================

  private archive(memories: Memory[]): { memories: Memory[]; changed: number } {
    // Truncate ARCHIVE-tier content to save space (keep first 200 chars)
    let changed = 0;
    const updated = memories.map(m => {
      if (m.tier === Tier.ARCHIVE && m.content.length > 200 && !m.tags.includes('consolidated')) {
        changed++;
        return {
          ...m,
          content: m.content.slice(0, 200) + '...',
          metadata: { ...m.metadata, truncated: true, originalLength: m.content.length },
        };
      }
      return m;
    });

    return { memories: updated, changed };
  }

  // ===========================================================================
  // Utils
  // ===========================================================================

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

  private countByTier(memories: Memory[]): Record<MemoryTier, number> {
    const counts = { hot: 0, warm: 0, cold: 0, archive: 0 } as Record<MemoryTier, number>;
    for (const m of memories) counts[m.tier] = (counts[m.tier] || 0) + 1;
    return counts;
  }
}
