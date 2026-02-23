/**
 * @terronex/engram-trace
 *
 * Autonomous memory intelligence for AI agents.
 * Auto-remember, auto-curate, semantic recall — powered by the .engram format.
 *
 * @example
 * ```typescript
 * import { EngramTrace } from '@terronex/engram-trace';
 *
 * const memory = new EngramTrace({ file: './agent.engram' });
 * await memory.init();
 *
 * // Session start — get context
 * const ctx = await memory.bootstrap();
 *
 * // Process conversation turns
 * await memory.process(userMessage, assistantResponse);
 *
 * // Semantic recall
 * const results = await memory.recall('what did we decide about pricing');
 *
 * // Explicit remember
 * await memory.remember('User prefers dark mode', { importance: 0.9 });
 *
 * // Cleanup
 * await memory.close();
 * ```
 */

export { EngramTrace } from './trace.js';
export { Classifier } from './classifier.js';
export { Consolidator } from './consolidator.js';
export { createEmbedder, LocalEmbedder, OllamaEmbedder, OpenAIEmbedder } from './embedder.js';
export { createLLM, OllamaLLM, AnthropicLLM, OpenAILLM } from './llm.js';
export type {
  TraceConfig,
  EmbedderConfig,
  LLMConfig,
  AutoRememberConfig,
  ConsolidateConfig,
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
} from './types.js';
export { MemoryTier as Tier } from './types.js';
