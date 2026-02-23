/**
 * Engram Trace — Importance Classifier
 *
 * Determines whether a conversation turn is worth remembering.
 * Heuristic-based by default (no LLM dependency).
 *
 * Classification signals:
 *   - Explicit memory commands ("remember this", "note that")
 *   - Decision language ("we decided", "let's go with", "the plan is")
 *   - Lesson language ("I learned", "the problem was", "never do X again")
 *   - Preference language ("I prefer", "don't use", "always do")
 *   - Factual content (names, dates, URLs, code, configs)
 *   - Negative signals (greetings, acknowledgments, filler)
 */

import type { Embedder } from './types.js';

// =============================================================================
// Pattern Definitions
// =============================================================================

/** High-importance patterns — almost always worth storing */
const EXPLICIT_REMEMBER = /\b(remember|note|save|store|don'?t forget|keep in mind|write (this |that )?down)\b/i;

const DECISION_PATTERNS = /\b(we decided|i decided|let'?s go with|the plan is|going (to|with)|we'?re doing|we chose|decision is|settled on|committed to|final answer)\b/i;

const LESSON_PATTERNS = /\b(i learned|lesson learned|the (problem|issue|bug|fix) was|never (do|again)|turns out|important to note|key (insight|finding|takeaway)|mistake was|root cause)\b/i;

const PREFERENCE_PATTERNS = /\b(i prefer|i like|i (don'?t |dis)like|always (use|do)|never (use|do)|my preference|i want|i need|please (don'?t|always))\b/i;

/** Medium-importance patterns — store if substantial enough */
const FACTUAL_PATTERNS = /\b(password|api[- ]?key|token|secret|url|endpoint|port|version|v\d+\.\d+|config|credential|license|patent|deadline|ip address|\d{4}-\d{2}-\d{2})\b/i;

const TECHNICAL_PATTERNS = /\b(architecture|design|schema|database|deploy|migration|refactor|performance|benchmark|algorithm|protocol|specification|format)\b/i;

const IDENTITY_PATTERNS = /\b(my name is|i am|i'?m a|i work (at|for|on)|my (role|job|title)|i live in|my (email|phone|address))\b/i;

/** Low-importance / skip patterns */
const SKIP_PATTERNS = /^(ok|okay|yes|no|sure|thanks|thank you|got it|nice|cool|great|good|perfect|awesome|lol|haha|hmm|right|yep|nope|sounds good|will do|on it)\s*[.!?]?$/i;

const GREETING_PATTERNS = /^(hi|hey|hello|good (morning|afternoon|evening)|what'?s up|how are you|howdy)\s*[.!?]?$/i;

const FILLER_PATTERNS = /^(let me (check|look|see|think)|one (moment|sec)|working on it|give me a (sec|moment)|loading|processing)\s*[.!?]*$/i;

// =============================================================================
// Classification Result
// =============================================================================

export interface ClassificationResult {
  /** Whether this content should be stored */
  shouldRemember: boolean;

  /** Importance score (0-1) */
  importance: number;

  /** Why this classification was made */
  reason: string;

  /** Suggested tags based on content analysis */
  suggestedTags: string[];
}

// =============================================================================
// Classifier
// =============================================================================

export class Classifier {
  private deduplicateThreshold: number;
  private minImportance: number;

  constructor(options: { deduplicateThreshold?: number; minImportance?: number } = {}) {
    this.deduplicateThreshold = options.deduplicateThreshold ?? 0.92;
    this.minImportance = options.minImportance ?? 0.3;
  }

  /**
   * Classify a conversation turn for memory worthiness.
   *
   * @param userMessage   - The user's message
   * @param assistantResponse - The assistant's response
   * @param existingEmbeddings - Existing memory embeddings for dedup check
   * @param embedder - Embedder for generating comparison embedding
   */
  async classify(
    userMessage: string,
    assistantResponse: string,
    existingEmbeddings?: Float32Array[],
    newEmbedding?: Float32Array,
  ): Promise<ClassificationResult> {
    const combined = `${userMessage}\n${assistantResponse}`;
    const userTrimmed = userMessage.trim();
    const tags: string[] = [];
    let importance = 0;
    let reason = '';

    // --- Skip checks (fast exit) ---

    if (userTrimmed.length < 10) {
      return { shouldRemember: false, importance: 0, reason: 'too short', suggestedTags: [] };
    }

    if (SKIP_PATTERNS.test(userTrimmed)) {
      return { shouldRemember: false, importance: 0, reason: 'acknowledgment/filler', suggestedTags: [] };
    }

    if (GREETING_PATTERNS.test(userTrimmed)) {
      return { shouldRemember: false, importance: 0, reason: 'greeting', suggestedTags: [] };
    }

    if (FILLER_PATTERNS.test(userTrimmed) || FILLER_PATTERNS.test(assistantResponse.trim())) {
      return { shouldRemember: false, importance: 0, reason: 'filler', suggestedTags: [] };
    }

    // --- High-importance checks ---

    if (EXPLICIT_REMEMBER.test(userTrimmed)) {
      importance = Math.max(importance, 0.95);
      reason = 'explicit remember command';
      tags.push('explicit');
    }

    if (DECISION_PATTERNS.test(combined)) {
      importance = Math.max(importance, 0.85);
      reason = reason || 'contains decision';
      tags.push('decision');
    }

    if (LESSON_PATTERNS.test(combined)) {
      importance = Math.max(importance, 0.85);
      reason = reason || 'contains lesson/insight';
      tags.push('lesson');
    }

    if (PREFERENCE_PATTERNS.test(combined)) {
      importance = Math.max(importance, 0.8);
      reason = reason || 'contains preference';
      tags.push('preference');
    }

    if (IDENTITY_PATTERNS.test(combined)) {
      importance = Math.max(importance, 0.8);
      reason = reason || 'contains identity information';
      tags.push('identity');
    }

    // --- Medium-importance checks ---

    if (FACTUAL_PATTERNS.test(combined)) {
      importance = Math.max(importance, 0.6);
      reason = reason || 'contains factual/config data';
      tags.push('factual');
    }

    if (TECHNICAL_PATTERNS.test(combined)) {
      importance = Math.max(importance, 0.5);
      reason = reason || 'contains technical discussion';
      tags.push('technical');
    }

    // --- Content length signal ---
    // Longer substantive exchanges are more likely worth keeping
    const wordCount = combined.split(/\s+/).length;
    if (wordCount > 200 && importance < 0.4) {
      importance = Math.max(importance, 0.4);
      reason = reason || 'substantive exchange (length)';
    }

    // --- Code detection ---
    if (/```[\s\S]{20,}```/.test(combined) || /\b(function|const|let|var|import|export|class|def|async)\b/.test(combined)) {
      importance = Math.max(importance, 0.45);
      if (!tags.includes('technical')) tags.push('technical');
      tags.push('code');
    }

    // --- Deduplication check ---
    if (newEmbedding && existingEmbeddings && existingEmbeddings.length > 0) {
      const maxSimilarity = this.maxCosineSimilarity(newEmbedding, existingEmbeddings);
      if (maxSimilarity > this.deduplicateThreshold) {
        return {
          shouldRemember: false,
          importance,
          reason: `duplicate (similarity: ${(maxSimilarity * 100).toFixed(1)}%)`,
          suggestedTags: tags,
        };
      }
    }

    // --- Default: low importance if nothing matched ---
    if (importance === 0) {
      // Still might be worth storing if it's a real conversation
      if (wordCount > 30) {
        importance = 0.2;
        reason = 'general conversation';
      } else {
        return { shouldRemember: false, importance: 0, reason: 'no importance signals', suggestedTags: [] };
      }
    }

    const shouldRemember = importance >= this.minImportance;

    return {
      shouldRemember,
      importance,
      reason,
      suggestedTags: tags,
    };
  }

  /**
   * Find the maximum cosine similarity between a vector and a set of vectors.
   * Used for deduplication.
   */
  private maxCosineSimilarity(query: Float32Array, candidates: Float32Array[]): number {
    let max = -1;
    for (const candidate of candidates) {
      if (candidate.length !== query.length) continue;
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < query.length; i++) {
        dot += query[i] * candidate[i];
        normA += query[i] * query[i];
        normB += candidate[i] * candidate[i];
      }
      const denom = Math.sqrt(normA) * Math.sqrt(normB);
      const sim = denom === 0 ? 0 : dot / denom;
      if (sim > max) max = sim;
    }
    return max;
  }
}
