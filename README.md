# Engram Trace

[![npm version](https://img.shields.io/npm/v/@terronex/engram-trace.svg)](https://www.npmjs.com/package/@terronex/engram-trace)
[![Powered by Engram](https://img.shields.io/badge/Powered%20by-Engram-ef4444)](https://github.com/Terronex-dev/engram)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Autonomous memory intelligence for AI agents.

Engram Trace gives any AI agent persistent, self-curating memory in a single `.engram` file. It automatically decides what to remember from conversations, consolidates old memories, removes duplicates, and provides semantic recall -- all without manual memory management.

Built on the [Engram](https://github.com/Terronex-dev/engram) neural memory format.

## The Problem

AI agents lose context between sessions. Current solutions require manual memory management (markdown files, vector databases, external services) that doesn't scale and breaks when the agent restarts.

## The Solution

One file. One import. Zero maintenance.

```typescript
import { EngramTrace } from '@terronex/engram-trace';

const memory = new EngramTrace({ file: './agent.engram' });
await memory.init();

// Agent now has persistent, self-curating memory
```

## Quick Start

```bash
npm install @terronex/engram-trace
```

```typescript
import { EngramTrace } from '@terronex/engram-trace';

// 1. Initialize
const memory = new EngramTrace({
  file: './my-agent.engram',
  debug: true,
});
await memory.init();

// 2. Bootstrap session context (replaces "read MEMORY.md")
const ctx = await memory.bootstrap();
console.log(ctx.identity);    // Who am I, who is my user
console.log(ctx.priorities);  // Active projects, current focus
console.log(ctx.decisions);   // Recent decisions, open blockers
console.log(ctx.preferences); // User preferences, communication style

// 3. Process conversation turns (auto-classifies and stores)
const result = await memory.process(
  'We decided to use MIT license for everything',
  'Got it. MIT license applied across all repos.'
);
console.log(result);
// { shouldRemember: true, importance: 0.85, reason: 'contains decision', suggestedTags: ['decision'] }

// 4. Explicit recall
const memories = await memory.recall('what license do we use');
// Returns top matches ranked by relevance + recency + importance

// 5. Explicit remember
await memory.remember('Deploy target is Cloudflare Pages', {
  importance: 0.7,
  tags: ['infrastructure'],
});

// 6. Cleanup
await memory.close();
```

## How It Works

### Auto-Remember

Every conversation turn is classified by importance using heuristic pattern matching:

| Signal | Importance | Example |
|--------|-----------|---------|
| Explicit command | 0.95 | "Remember this", "Note that" |
| Decision | 0.85 | "We decided to use MIT license" |
| Lesson learned | 0.85 | "The problem was msgpackr corrupting Float32Array" |
| Preference | 0.80 | "I prefer concise responses" |
| Identity info | 0.80 | "My name is Jason, I work at Terronex" |
| Factual data | 0.60 | API keys, URLs, version numbers |
| Technical discussion | 0.50 | Architecture, design, schemas |
| Greeting/filler | 0.00 | "ok", "thanks", "nice" (skipped) |

Memories are deduplicated before storage. If a new memory is >92% similar to an existing one, it's skipped.

### Auto-Curate (Consolidation)

Runs automatically every 100 writes or every 6 hours (configurable):

1. **Decay** -- memories age through tiers based on time and access frequency
   - HOT (0-7 days) -> WARM (7-30 days) -> COLD (30-365 days) -> ARCHIVE (>365 days)
   - Frequently accessed memories stay hotter longer
   - High-importance memories decay slower

2. **Deduplicate** -- remove near-identical memories (cosine similarity >0.92)

3. **Cluster** -- group similar memories by embedding proximity

4. **Summarize** -- collapse clusters into condensed memories (requires LLM)

5. **Archive** -- truncate old archive-tier content to save space

### Semantic Recall

Recall is tier-aware: HOT memories get a slight relevance boost, ARCHIVE memories are deprioritized. Access counts update on every recall, which feeds back into the decay algorithm.

```typescript
const results = await memory.recall('deployment infrastructure', {
  limit: 5,
  minScore: 0.2,
  tiers: ['hot', 'warm'],  // Only recent memories
  tags: ['infrastructure'], // Filter by tag
});
```

## Configuration

```typescript
const memory = new EngramTrace({
  // Required
  file: './agent.engram',

  // Embedding provider (default: local, zero-config)
  embedder: {
    provider: 'local',                    // 'local' | 'ollama' | 'openai'
    model: 'Xenova/all-MiniLM-L6-v2',    // Default model
  },

  // LLM for consolidation summaries (optional)
  llm: {
    provider: 'ollama',                   // 'ollama' | 'anthropic' | 'openai'
    model: 'llama3.1:8b',
  },

  // Auto-remember behavior
  autoRemember: {
    heuristic: true,       // Use pattern-based classifier
    minImportance: 0.3,    // Minimum score to store
    defaultTags: ['auto'], // Tags applied to all auto-memories
  },

  // Auto-consolidation behavior
  autoConsolidate: {
    everyNWrites: 100,          // Consolidate every N writes
    intervalMs: 6 * 3600000,   // Or every 6 hours
    minClusterSize: 3,          // Min memories to form a cluster
    clusterThreshold: 0.78,     // Similarity threshold for clustering
    hotDays: 7,                 // Days before HOT -> WARM
    warmDays: 30,               // Days before WARM -> COLD
    coldDays: 365,              // Days before COLD -> ARCHIVE
  },

  // Deduplication threshold (0-1)
  deduplicateThreshold: 0.92,

  // Hard limit before forced consolidation
  maxMemories: 10000,

  // Debug logging
  debug: false,
});
```

### Minimal Config (Zero Config)

```typescript
// This is all you need. Everything else has sensible defaults.
const memory = new EngramTrace({ file: './agent.engram' });
```

### With Ollama (Free, Private, Local)

```typescript
const memory = new EngramTrace({
  file: './agent.engram',
  llm: { provider: 'ollama', model: 'llama3.1:8b' },
});
```

### With Claude (Higher Quality Consolidation)

```typescript
const memory = new EngramTrace({
  file: './agent.engram',
  llm: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
});
```

## API Reference

### `new EngramTrace(config)`

Create a new trace instance. Does not load the file yet.

### `.init(): Promise<void>`

Load existing memories from the .engram file (or start fresh). Must be called before any other method.

### `.bootstrap(): Promise<BootstrapContext>`

Run 4 broad recall queries to build session context. Returns:
- `identity` -- who the agent is, who the user is
- `priorities` -- active projects, current focus
- `decisions` -- recent decisions, open blockers
- `preferences` -- user preferences, communication style
- `raw` -- the full RecallResult arrays

### `.process(userMessage, assistantResponse): Promise<ClassificationResult>`

Classify a conversation turn and auto-store if worthy. Returns:
- `shouldRemember` -- whether it was stored
- `importance` -- score (0-1)
- `reason` -- why it was classified this way
- `suggestedTags` -- auto-detected tags

### `.remember(content, options?): Promise<Memory>`

Explicitly store a memory. Options:
- `importance` -- 0-1, default 0.5
- `tags` -- string array
- `source` -- source identifier
- `metadata` -- arbitrary key-value data

### `.recall(query, options?): Promise<RecallResult[]>`

Semantic search. Options:
- `limit` -- max results (default 8)
- `minScore` -- minimum similarity (default 0.15)
- `tiers` -- filter by memory tier
- `tags` -- filter by tags
- `decayBoost` -- apply temporal boosting (default true)

### `.forget(query, threshold?): Promise<number>`

Remove memories matching a query above the similarity threshold. Returns count removed. Useful for corrections and GDPR compliance.

### `.consolidate(): Promise<ConsolidationReport>`

Run consolidation manually. Returns a detailed report of what changed.

### `.stats(): TraceStats`

Get current state: memory counts by tier, file size, last consolidation, etc.

### `.export(): Array<...>`

Export all memories as JSON (embeddings excluded for readability).

### `.close(): Promise<void>`

Save to disk and clean up timers. Call this on shutdown.

## Architecture

```
                   Your Agent / Bot
                        |
                   EngramTrace
                   /    |    \
          Classifier  Store  Consolidator
              |         |         |
          Heuristic  .engram   Cluster
          Patterns    File     Summarize
              |         |      Decay
          Embedder   @terronex  LLM
          (local)    /engram   (optional)
```

**No external services required.** Embeddings run locally via @xenova/transformers. The LLM is optional (only used for consolidation summaries). Everything persists in a single portable .engram file.

## Integration Examples

### OpenClaw / Clawdbot

```typescript
// In agent initialization
const memory = new EngramTrace({ file: '~/.openclaw/agents/main/memory.engram' });
await memory.init();
const ctx = await memory.bootstrap();
systemPrompt += ctx.identity + ctx.preferences;

// In message handler
async function onMessage(user, assistant) {
  await memory.process(user, assistant);
}

// In heartbeat
async function onHeartbeat() {
  await memory.consolidate();
}
```

### Discord Bot

```typescript
client.on('messageCreate', async (msg) => {
  const response = await generateResponse(msg.content);
  await memory.process(msg.content, response);
  msg.reply(response);
});
```

### Express API

```typescript
app.post('/chat', async (req, res) => {
  const ctx = await memory.bootstrap();
  const response = await llm.chat(req.body.message, { context: ctx });
  await memory.process(req.body.message, response);
  res.json({ response });
});
```

## Performance

Benchmarked on WSL2 / Intel CPU / RTX 4070 Super (GPU used only for Ollama LLM, not embeddings):

| Operation | Latency | Notes |
|-----------|---------|-------|
| Embedding (local) | 2.5ms | MiniLM-L6-v2, CPU |
| Recall (4K memories) | 4.6ms | Cosine similarity + tier boost |
| Recall (275 memories) | 3.8ms | Sub-linear scaling |
| Process (classify + embed + store) | ~8ms | Heuristic classifier |
| Consolidation (4K memories) | Varies | Depends on cluster count + LLM |
| Bootstrap (4 queries) | ~16ms | Parallel recall |
| File load (25 MB) | ~1100ms | One-time at init |

## File Format

Engram Trace stores everything in a single `.engram` file using the [Engram neural memory format](https://github.com/Terronex-dev/engram). Each memory is a node containing:

- Content text
- 384-dimensional embedding vector (MiniLM-L6-v2)
- Metadata (tier, importance, tags, timestamps, access count)

The file is portable, version-controllable, and human-inspectable (via engram CLI tools).

## License

MIT -- Terronex 2026

---

## Trace vs Trace Lite

This package (`@terronex/engram-trace`) is designed for **autonomous AI agents** that run continuously and manage their own memory lifecycle. It includes background consolidation timers, auto-remember heuristics, and built-in embedding/LLM providers.

For applications that manage memory explicitly (interactive tools, teaching systems, CLIs), see [`@terronex/engram-trace-lite`](https://github.com/Terronex-dev/engram-trace-lite) -- a stateless, pure-function consolidation library with zero background processes.

| | Trace (this package) | Trace Lite |
|---|---|---|
| Architecture | Stateful class with timers | Stateless pure functions |
| Agent loop | Built-in auto-remember, auto-consolidate | None -- caller triggers consolidation |
| LLM | Optional (summarization + auto-importance) | Optional (summarization only) |
| Embedding | Built-in provider support | Bring your own |
| Background work | Interval-based consolidation | None |
| Recall | Built-in with tier filtering | Not included (use @terronex/engram) |
| Size | ~1,700 lines | ~300 lines |
| Use case | Rex, autonomous agents, daemons | Allo, teaching systems, custom apps |


## Disclaimer

This software is provided as-is under the MIT license. It is under active development and has not undergone a third-party security audit. The encryption implementation (AES-256-GCM with argon2id/PBKDF2) has not been independently verified.

Do not use this software as the sole protection for sensitive data without your own due diligence. The authors and Terronex are not liable for data loss, security breaches, or any damages arising from the use of this software. See LICENSE for full terms.
